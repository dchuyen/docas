import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const port = Number(process.env.PORT) || 3000;
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const publicDirectory = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const maxAttachmentBytes = 10 * 1024 * 1024;

async function readGuidanceFile() {
	try {
		const filePath = join(projectRoot, 'huongdan.txt');
		return await readFile(filePath, 'utf8');
	} catch (error) {
		console.warn('Không tìm thấy hoặc không đọc được huongdan.txt:', error.message);
		return null;
	}
}

const contentTypes = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.webmanifest': 'application/manifest+json; charset=utf-8',
};

function sendJson(response, statusCode, payload) {
	response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(payload));
}

async function readJson(request) {
	let body = '';
	for await (const chunk of request) {
		body += chunk;
		if (body.length > 15_000_000) {
			throw new Error('Request body is too large.');
		}
	}
	return JSON.parse(body || '{}');
}

async function askGemini(message, history, attachment, link) {
	const userParts = [{ text: message }];
	if (attachment) {
		userParts.push({
			inlineData: {
				mimeType: attachment.mimeType,
				data: attachment.data,
			},
		});
	}
	if (link) {
		userParts.push({ text: `Liên kết người dùng đính kèm: ${link}\nHãy sử dụng liên kết này làm ngữ cảnh nếu phù hợp.` });
	}

	const contents = [
		...history.slice(-20).map(({ role, text }) => ({
			role: role === 'assistant' ? 'model' : 'user',
			parts: [{ text }],
		})),
		{ role: 'user', parts: userParts },
	];

	const geminiResponse = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				systemInstruction: {
					parts: [{ text: 'You are a thoughtful, concise AI assistant. Answer in the same language as the user.' }],
				},
				contents,
				generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
			}),
		},
	);

	const data = await geminiResponse.json();
	if (!geminiResponse.ok) {
		throw new Error(data.error?.message || 'Gemini API request failed.');
	}

	const text = data.candidates?.[0]?.content?.parts
		?.map((part) => part.text || '')
		.join('')
		.trim();

	if (!text) {
		throw new Error('Gemini returned an empty response.');
	}
	return text;
}

function googleExportUrl(link) {
	try {
		const parsedLink = new URL(link);
		const host = parsedLink.hostname.toLowerCase();
		const pathParts = parsedLink.pathname.split('/');
		const fileType = host === 'docs.google.com' && pathParts[1] === 'document'
			? 'document'
			: host === 'docs.google.com' && pathParts[1] === 'spreadsheets'
				? 'spreadsheet'
				: null;
		if (!fileType || pathParts[2] !== 'd' || !pathParts[3]) return null;

		const exportFormat = 'pdf';
		return {
			url: `https://docs.google.com/${fileType === 'document' ? 'document' : 'spreadsheets'}/d/${pathParts[3]}/export?format=${exportFormat}`,
			name: `${fileType === 'document' ? 'google-doc' : 'google-sheet'}-${pathParts[3]}.pdf`,
			fileType,
			fileId: pathParts[3],
		};
	} catch {
		return null;
	}
}

function googleStatusExportUrl(link) {
	const exportDetails = googleExportUrl(link);
	if (!exportDetails) return null;
	const fileType = exportDetails.fileType === 'document' ? 'document' : 'spreadsheets';
	const format = fileType === 'document' ? 'txt' : 'csv';
	return `https://docs.google.com/${fileType}/d/${exportDetails.fileId}/export?format=${format}`;
}

async function getGoogleDocumentFingerprint(link) {
	const documentContent = await getGoogleDocumentContent(link);
	return createHash('sha256').update(documentContent.bytes).digest('hex');
}

async function getGoogleDocumentContent(link) {
	const statusUrl = googleStatusExportUrl(link);
	if (!statusUrl) return null;
	const fileResponse = await fetch(statusUrl, { signal: AbortSignal.timeout(15_000) });
	if (!fileResponse.ok) {
		throw new Error('Không thể đọc nội dung Google file. Hãy kiểm tra file đã được chia sẻ công khai chưa.');
	}
	const contentLength = Number(fileResponse.headers.get('content-length'));
	if (contentLength > maxAttachmentBytes) throw new Error('Google file vượt quá giới hạn 10 MB.');
	const contentBytes = new Uint8Array(await fileResponse.arrayBuffer());
	if (contentBytes.byteLength > maxAttachmentBytes) throw new Error('Google file vượt quá giới hạn 10 MB.');
	return { bytes: contentBytes, text: Buffer.from(contentBytes).toString('utf8') };
}

async function downloadGoogleFile(link) {
	const exportDetails = googleExportUrl(link);
	if (!exportDetails) return null;

	const fileResponse = await fetch(exportDetails.url, { signal: AbortSignal.timeout(15_000) });
	if (!fileResponse.ok) {
		throw new Error('Không thể tải Google file. Hãy kiểm tra file đã được chia sẻ công khai chưa.');
	}

	const contentLength = Number(fileResponse.headers.get('content-length'));
	if (contentLength > maxAttachmentBytes) {
		throw new Error('Google file vượt quá giới hạn 10 MB.');
	}
	const fileBytes = new Uint8Array(await fileResponse.arrayBuffer());
	if (fileBytes.byteLength > maxAttachmentBytes) {
		throw new Error('Google file vượt quá giới hạn 10 MB.');
	}

	const normalizedPdf = Buffer.from(fileBytes).toString('latin1')
		.replace(/\/CreationDate\s*\([^)]*\)/g, (value) => ' '.repeat(value.length))
		.replace(/\/ModDate\s*\([^)]*\)/g, (value) => ' '.repeat(value.length))
		.replace(/\/ID\s*\[\s*<[^>]*>\s*<[^>]*>\s*\]/g, (value) => ' '.repeat(value.length));

	return {
		name: exportDetails.name,
		mimeType: 'application/pdf',
		data: Buffer.from(fileBytes).toString('base64'),
		fingerprint: createHash('sha256').update(normalizedPdf, 'latin1').digest('hex'),
	};
}

async function getGoogleFileTitle(link) {
	const exportDetails = googleExportUrl(link);
	if (!exportDetails) return null;
	const fallbackTitle = exportDetails.name.startsWith('google-doc') ? 'Google Docs' : 'Google Sheets';

	try {
		const pageResponse = await fetch(link, { signal: AbortSignal.timeout(10_000) });
		if (!pageResponse.ok) return fallbackTitle;
		const html = await pageResponse.text();
		const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
		const title = titleMatch?.[1]
			?.replace(/&amp;/g, '&')
			.replace(/&#39;/g, "'")
			.replace(/&quot;/g, '"')
			.replace(/\s+-\s+Google (Docs|Sheets)$/i, '')
			.trim();
		return title || fallbackTitle;
	} catch {
		return fallbackTitle;
	}
}

async function serveStatic(request, response) {
	const requestedPath = request.url === '/' ? '/index.html' : new URL(request.url, 'http://localhost').pathname;
	const filePath = normalize(join(publicDirectory, requestedPath));
	if (!filePath.startsWith(publicDirectory)) {
		response.writeHead(403);
		response.end('Forbidden');
		return;
	}

	try {
		const file = await readFile(filePath);
		response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
		response.end(file);
	} catch {
		response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		response.end('Not found');
	}
}

const server = createServer(async (request, response) => {
	try {
		if (request.method === 'GET' && request.url === '/api/config') {
			sendJson(response, 200, { configured: Boolean(geminiApiKey), model: geminiModel });
			return;
		}

		if (request.method === 'POST' && request.url === '/api/document-status') {
			const { link, fingerprint: knownFingerprint } = await readJson(request);
			if (typeof link !== 'string' || !googleExportUrl(link)) {
				sendJson(response, 400, { error: 'Liên kết Google Docs hoặc Google Sheets không hợp lệ.' });
				return;
			}

			try {
				const fingerprint = await getGoogleDocumentFingerprint(link);
				sendJson(response, 200, {
					fingerprint,
					changed: Boolean(knownFingerprint && knownFingerprint !== fingerprint),
					checkedAt: new Date().toISOString(),
				});
			} catch (error) {
				sendJson(response, 422, { error: error.message || 'Không thể kiểm tra Google file.' });
			}
			return;
		}

		if (request.method === 'POST' && request.url === '/api/document-download') {
			const { link } = await readJson(request);
			if (typeof link !== 'string' || !googleExportUrl(link)) {
				sendJson(response, 400, { error: 'Liên kết Google Docs hoặc Google Sheets không hợp lệ.' });
				return;
			}
			try {
				const exportDetails = googleExportUrl(link);
				const content = await getGoogleDocumentContent(link);
				const fingerprint = createHash('sha256').update(content.bytes).digest('hex');
				sendJson(response, 200, {
					content: content.text,
					filename: exportDetails.fileType === 'document' ? 'google-document.txt' : 'google-spreadsheet.csv',
					mimeType: exportDetails.fileType === 'document' ? 'text/plain' : 'text/csv',
					fingerprint,
				});
			} catch (error) {
				sendJson(response, 422, { error: error.message || 'Không thể tải phiên bản mới của Google file.' });
			}
			return;
		}

		if (request.method === 'POST' && request.url === '/api/chat') {
			if (!geminiApiKey) {
				sendJson(response, 503, { error: 'Chưa cấu hình GEMINI_API_KEY trên server.' });
				return;
			}

			const { message, history = [], attachment, link } = await readJson(request);
			if (typeof message !== 'string' || !message.trim()) {
				sendJson(response, 400, { error: 'Tin nhắn không được để trống.' });
				return;
			}
			const normalizedHistory = Array.isArray(history) ? history : [];
			const isFirstMessageInNewChat = normalizedHistory.length === 0;
			const guidanceText = isFirstMessageInNewChat ? await readGuidanceFile() : null;
			const guidedMessage = guidanceText
				? `Hãy làm theo file huongdan.txt dưới đây và tuân thủ nghiêm ngặt các quy định trong đó.\n\n${guidanceText}\n\nYêu cầu của người dùng:\n${message.trim()}`
				: message.trim();
			if (attachment) {
				const allowedTypes = /^(image\/(jpeg|png|webp|gif)|application\/pdf|text\/plain|text\/csv|text\/markdown|application\/json)$/;
				if (!allowedTypes.test(attachment.mimeType) || typeof attachment.data !== 'string' || attachment.data.length > 14_000_000) {
					sendJson(response, 400, { error: 'Tệp không hợp lệ hoặc vượt quá giới hạn 10 MB.' });
					return;
				}
			}
			if (link) {
				try {
					const parsedLink = new URL(link);
					if (!['http:', 'https:'].includes(parsedLink.protocol)) throw new Error();
					if (!googleExportUrl(link)) throw new Error('google-file');
				} catch {
					sendJson(response, 400, { error: 'Vui lòng nhập liên kết Google Docs hoặc Google Sheets hợp lệ.' });
					return;
				}
			}
			let googleAttachment = null;
			let linkTitle = null;
			try {
				googleAttachment = link ? await downloadGoogleFile(link) : null;
				linkTitle = link ? await getGoogleFileTitle(link) : null;
			} catch (error) {
				sendJson(response, 422, { error: error.message || 'Không thể tải Google file.' });
				return;
			}

			const answer = await askGemini(guidedMessage, normalizedHistory, googleAttachment || attachment, link);
			let linkFingerprint = null;
			try {
				linkFingerprint = link ? await getGoogleDocumentFingerprint(link) : null;
			} catch { }
			sendJson(response, 200, { answer, linkTitle, linkFingerprint });
			return;
		}

		if (request.method === 'GET') {
			await serveStatic(request, response);
			return;
		}

		sendJson(response, 405, { error: 'Method not allowed.' });
	} catch (error) {
		console.error(error);
		sendJson(response, 500, { error: error.message || 'Đã xảy ra lỗi không xác định.' });
	}
});

server.listen(port, () => {
	console.log(`Docas is running at http://localhost:${port}`);
	if (!geminiApiKey) console.log('Set GEMINI_API_KEY to enable Gemini chat.');
});
