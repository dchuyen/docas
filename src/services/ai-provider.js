function getApiErrorMessage(value, fallback) {
	if (typeof value === 'string' && value.trim()) return value;
	if (value && typeof value.message === 'string' && value.message.trim()) return value.message;
	if (value && typeof value === 'object') {
		try { return JSON.stringify(value); } catch { /* Ignore unserializable provider errors. */ }
	}
	return fallback;
}

function createAttachmentPart(attachment) {
	if (attachment.mimeType.startsWith('image/')) {
		return { type: 'image_url', image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` } };
	}
	if (attachment.mimeType === 'application/pdf') {
		return { type: 'file', file: { filename: attachment.name || 'attachment.pdf', file_data: `data:application/pdf;base64,${attachment.data}` } };
	}
	return { type: 'text', text: `\n\nNội dung tệp ${attachment.name || 'đính kèm'}:\n${Buffer.from(attachment.data, 'base64').toString('utf8')}` };
}

async function searchTavily(query, apiKey) {
	if (!apiKey) throw new Error('Chưa cấu hình TAVILY_API_KEY trên server.');

	const tavilyResponse = await fetch('https://api.tavily.com/search', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			api_key: apiKey,
			query,
			search_depth: 'advanced',
			max_results: 5,
			include_answer: false,
			include_raw_content: false,
		}),
		signal: AbortSignal.timeout(20_000),
	});
	const data = await tavilyResponse.json();
	if (!tavilyResponse.ok) throw new Error(getApiErrorMessage(data.detail || data.error, 'Tavily không thể tìm kiếm lúc này.'));
	return (data.results || []).map((result) => ({
		title: result.title || result.url,
		url: result.url,
		content: result.content || '',
		publishedDate: result.published_date || '',
	}));
}

function formatWebSources(sources) {
	if (!sources.length) return 'Không tìm thấy nguồn web phù hợp.';
	return sources.map((source, index) => [
		`[Nguồn ${index + 1}] ${source.title}`,
		`URL: ${source.url}`,
		source.publishedDate ? `Ngày xuất bản: ${source.publishedDate}` : '',
		source.content,
	].filter(Boolean).join('\n')).join('\n\n');
}

export async function askGroq({ message, history, attachment, link, webSources = [], apiKey, model }) {
	const userParts = [{ type: 'text', text: message }];
	if (attachment) userParts.push(createAttachmentPart(attachment));
	if (link) {
		userParts.push({ type: 'text', text: `Liên kết người dùng đính kèm: ${link}\nHãy sử dụng liên kết này làm ngữ cảnh nếu phù hợp.` });
	}
	if (webSources.length) {
		userParts.push({
			type: 'text',
			text: `Kết quả tìm kiếm web từ Tavily. Hãy tổng hợp thông tin dựa trên các nguồn này, phân biệt rõ dữ kiện và suy luận, và dẫn nguồn bằng cú pháp Markdown [tên nguồn](URL). Nếu nguồn mâu thuẫn, hãy nêu rõ điều đó.\n\n${formatWebSources(webSources)}`,
		});
	}

	const contents = [
		...history.slice(-20).map(({ role, text }) => ({
			role: role === 'assistant' ? 'model' : 'user',
			content: text,
		})),
		{ role: 'user', content: userParts },
	];

	const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: 'You are a thoughtful, concise AI assistant. Answer in the same language as the user.' },
				...contents.map(({ role, content }) => ({ role: role === 'model' ? 'assistant' : role, content })),
			],
			temperature: 0.7,
			max_tokens: 2048,
		}),
	});

	const data = await groqResponse.json();
	if (!groqResponse.ok) throw new Error(data.error?.message || 'Groq API request failed.');

	const responseContent = data.choices?.[0]?.message?.content;
	const text = typeof responseContent === 'string'
		? responseContent.trim()
		: responseContent?.map((part) => part.text || '').join('').trim();
	if (!text) throw new Error('Groq returned an empty response.');
	return text;
}

export { searchTavily };
