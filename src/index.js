import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { askGroq, searchTavily } from './services/ai-provider.js';
import { downloadGoogleFile, getGoogleDocumentContent, getGoogleDocumentFingerprint, getGoogleFileTitle, googleExportUrl } from './services/google-documents.js';

const port = Number(process.env.PORT) || 3000;
const groqApiKey = process.env.GROQ_API_KEY;
const tavilyApiKey = process.env.TAVILY_API_KEY;
const groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const publicDirectory = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

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
	}
	return JSON.parse(body || '{}');
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
			sendJson(response, 200, { configured: Boolean(groqApiKey), tavilyConfigured: Boolean(tavilyApiKey), model: groqModel });
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
			if (!groqApiKey) {
				sendJson(response, 503, { error: 'Chưa cấu hình GROQ_API_KEY trên server.' });
				return;
			}

			const { message, history = [], attachment, link, webSearch = false } = await readJson(request);
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
				if (!allowedTypes.test(attachment.mimeType) || typeof attachment.data !== 'string') {
					sendJson(response, 400, { error: 'Tệp không hợp lệ.' });
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
			let webSources = [];
			if (webSearch) {
				try {
					webSources = await searchTavily(message.trim(), tavilyApiKey);
				} catch (error) {
					sendJson(response, 422, { error: error.message || 'Không thể tìm kiếm trên web.' });
					return;
				}
			}
			try {
				googleAttachment = link ? await downloadGoogleFile(link) : null;
				linkTitle = link ? await getGoogleFileTitle(link) : null;
			} catch (error) {
				sendJson(response, 422, { error: error.message || 'Không thể tải Google file.' });
				return;
			}

			const answer = await askGroq({
				message: guidedMessage,
				history: normalizedHistory,
				attachment: googleAttachment || attachment,
				link,
				webSources,
				apiKey: groqApiKey,
				model: groqModel,
			});
			let linkFingerprint = null;
			try {
				linkFingerprint = link ? await getGoogleDocumentFingerprint(link) : null;
			} catch { }
			sendJson(response, 200, { answer, linkTitle, linkFingerprint, webSources: webSources.map(({ title, url, publishedDate }) => ({ title, url, publishedDate })) });
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
	if (!groqApiKey) console.log('Set GROQ_API_KEY to enable Groq chat.');
});
