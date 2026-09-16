function createAttachmentPart(attachment) {
	if (attachment.mimeType.startsWith('image/')) {
		return { type: 'image_url', image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` } };
	}
	if (attachment.mimeType === 'application/pdf') {
		return { type: 'file', file: { filename: attachment.name || 'attachment.pdf', file_data: `data:application/pdf;base64,${attachment.data}` } };
	}
	return {
		type: 'text',
		text: `\n\nNội dung tệp ${attachment.name || 'đính kèm'}:\n${Buffer.from(attachment.data, 'base64').toString('utf8')}`,
	};
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

const MAX_GROQ_REQUEST_BYTES = 18 * 1024 * 1024;

function createMessages({ message, history, attachment, link, webSources }) {
	const userPrompt = appendTimestampToPrompt(message);
	const userParts = [{ type: 'text', text: userPrompt }];
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

	return [
		{ role: 'system', content: 'You are a thoughtful, concise AI assistant. Answer in the same language as the user.' },
		...history.map(({ role, text }) => ({
			role: role === 'assistant' ? 'assistant' : 'user',
			content: text,
		})),
		{ role: 'user', content: userParts },
	];
}

function createRequestBody({ message, history, attachment, link, webSources, model }) {
	for (let historyCount = Math.min(history.length, 20); historyCount >= 0; historyCount -= 1) {
		const body = {
			model,
			messages: createMessages({ message, history: historyCount ? history.slice(-historyCount) : [], attachment, link, webSources }),
			temperature: 0.7,
			max_tokens: 2048,
		};
		const serializedBody = JSON.stringify(body);
		if (Buffer.byteLength(serializedBody, 'utf8') <= MAX_GROQ_REQUEST_BYTES) return serializedBody;
	}

	throw new Error('Tệp đính kèm hoặc nội dung yêu cầu quá lớn. Hãy dùng tệp nhỏ hơn 13 MB hoặc bỏ bớt nội dung rồi thử lại.');
}

export function appendTimestampToPrompt(message) {
	const now = new Date();
	const formattedDateTime = new Intl.DateTimeFormat('vi-VN', {
		timeZone: 'Asia/Ho_Chi_Minh',
		dateStyle: 'full',
		timeStyle: 'short',
		hour12: false,
	}).format(now);
	return `${message}\n\n[Thời gian hiện tại: ${formattedDateTime}]`;
}

export async function askGroq({ message, history, attachment, link, webSources = [], apiKey, model }) {
	const requestBody = createRequestBody({ message, history, attachment, link, webSources, model });

	const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: requestBody,
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
