# docas

Ứng dụng chat AI dùng OpenRouter API, chạy bằng Node.js thuần.
Ứng dụng chat AI dùng OpenRouter API, chạy bằng Node.js thuần.

## Cấu hình

1. Sao chép `.env.example` thành `.env`.
2. Thêm OpenRouter API key vào `OPENROUTER_API_KEY`.
2. Thêm OpenRouter API key vào `OPENROUTER_API_KEY`.
3. Nạp biến môi trường trước khi chạy. Ví dụ trên Linux/macOS:

```bash
export OPENROUTER_API_KEY="your_api_key"
export OPENROUTER_API_KEY="your_api_key"
```

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
Bạn có thể đính kèm tệp trực tiếp hoặc dán link Google Docs/Google Sheets. Google file cần được chia sẻ với quyền `Anyone with the link`; server sẽ tải bản PDF export tạm thời và gửi cho OpenRouter, không lưu file xuống ổ đĩa.
