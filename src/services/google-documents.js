import { createHash } from 'node:crypto';

export function googleExportUrl(link) {
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

		return {
			url: `https://docs.google.com/${fileType === 'document' ? 'document' : 'spreadsheets'}/d/${pathParts[3]}/export?format=pdf`,
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

export async function getGoogleDocumentContent(link) {
	const statusUrl = googleStatusExportUrl(link);
	if (!statusUrl) return null;
	const fileResponse = await fetch(statusUrl, { signal: AbortSignal.timeout(15_000) });
	if (!fileResponse.ok) throw new Error('Không thể đọc nội dung Google file. Hãy kiểm tra file đã được chia sẻ công khai chưa.');
	const contentBytes = new Uint8Array(await fileResponse.arrayBuffer());
	return { bytes: contentBytes, text: Buffer.from(contentBytes).toString('utf8') };
}

export async function getGoogleDocumentFingerprint(link) {
	const documentContent = await getGoogleDocumentContent(link);
	return createHash('sha256').update(documentContent.bytes).digest('hex');
}

export async function downloadGoogleFile(link) {
	const exportDetails = googleExportUrl(link);
	if (!exportDetails) return null;
	const fileResponse = await fetch(exportDetails.url, { signal: AbortSignal.timeout(15_000) });
	if (!fileResponse.ok) throw new Error('Không thể tải Google file. Hãy kiểm tra file đã được chia sẻ công khai chưa.');

	const fileBytes = new Uint8Array(await fileResponse.arrayBuffer());
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

export async function getGoogleFileTitle(link) {
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
