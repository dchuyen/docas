function getApiErrorMessage(value, fallback) {
	if (typeof value === 'string' && value.trim()) return value;
	if (value && typeof value.message === 'string' && value.message.trim()) return value.message;
	if (value && typeof value === 'object') {
		try { return JSON.stringify(value); } catch { /* Ignore unserializable provider errors. */ }
	}
	return fallback;
}

export async function searchTavily(query, apiKey) {
	if (!apiKey) throw new Error('Chưa cấu hình TAVILY_API_KEY trên server.');

	const tavilyResponse = await fetch('https://api.tavily.com/search', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			api_key: apiKey,
			query,
			search_depth: 'basic',
			max_results: 5,
			include_answer: false,
			include_raw_content: false,
		}),
		signal: AbortSignal.timeout(20_000),
	});

	const data = await tavilyResponse.json();
	if (!tavilyResponse.ok) {
		throw new Error(getApiErrorMessage(data.detail || data.error, 'Tavily không thể tìm kiếm lúc này.'));
	}

	return (data.results || []).map((result) => ({
		title: result.title || result.url,
		url: result.url,
		content: result.content || '',
		publishedDate: result.published_date || '',
	}));
}
