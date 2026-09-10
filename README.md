# docas

# docas

Ứng dụng chat AI dùng OpenRouter API và Tavily, chạy bằng Node.js thuần.

## Cấu hình

1. Tạo file `.env` ở thư mục gốc.
2. Thêm API key:

```env
OPENROUTER_API_KEY=your_openrouter_api_key
TAVILY_API_KEY=your_tavily_api_key
```

`TAVILY_API_KEY` là bắt buộc khi bật công tắc **Tìm web** trong ô nhập. API key chỉ được dùng ở backend và không được gửi vào frontend.

## Run

```bash
npm start
```

For development with automatic reload:

```bash
npm run dev
```

Mở `http://localhost:3000` trong trình duyệt. API key chỉ được dùng ở backend và không được gửi vào frontend.

Bạn có thể đính kèm tệp trực tiếp hoặc dán link Google Docs/Google Sheets. Google file cần được chia sẻ với quyền `Anyone with the link`; server sẽ tải bản PDF export tạm thời và gửi cho OpenRouter, không lưu file xuống ổ đĩa.

Khi bật **Tìm web**, Docas gửi câu hỏi tới Tavily, lấy tối đa 5 nguồn phù hợp rồi nhờ OpenRouter tổng hợp câu trả lời kèm liên kết dẫn nguồn.
