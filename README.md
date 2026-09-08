# docas

Ứng dụng chat AI dùng Gemini API, chạy bằng Node.js thuần.

## Cấu hình

1. Sao chép `.env.example` thành `.env`.
2. Thêm Gemini API key vào `GEMINI_API_KEY`.
3. Nạp biến môi trường trước khi chạy. Ví dụ trên Linux/macOS:

```bash
export GEMINI_API_KEY="your_api_key"
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

Bạn có thể đính kèm tệp trực tiếp hoặc dán link Google Docs/Google Sheets. Google file cần được chia sẻ với quyền `Anyone with the link`; server sẽ tải bản PDF export tạm thời và gửi cho Gemini, không lưu file xuống ổ đĩa.
