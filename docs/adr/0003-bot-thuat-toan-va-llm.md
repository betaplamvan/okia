# ADR-0003 — Bỏ chơi cùng máy; một bot thuật toán, LLM chỉ tạo cá tính

- **Ngày:** 2026-10-20
- **Trạng thái:** Chấp nhận

## Bối cảnh

- Chế độ hai người chơi chung một thiết bị không phù hợp hướng đi online và chia sẻ link → bỏ.
- Chế độ chơi với máy không muốn chia mức Dễ/Vừa/Khó.
- Người phát triển có sẵn server LLM (Qwen) và muốn tận dụng cho bot.

## Các phương án đã cân nhắc

1. **LLM chọn nước đi.** Bị loại: LLM xử lý không gian lưới kém (bỏ lỡ ô ăn được, tặng ô, có thể chọn cạnh không hợp lệ); mỗi nước tốn 1–5 giây GPU, một ván 5×5 tới 60 nước; khó cân chỉnh độ mạnh.
2. **Thuật toán chọn nước + LLM tạo lời thoại và nhận xét.** Được chọn.

## Quyết định

- Bỏ chế độ chơi cùng máy.
- **Một bot duy nhất** dùng thuật toán (cạnh an toàn, luật chuỗi dài, double-cross, tìm kiếm cuối ván), độ mạnh `strength` **tự điều chỉnh ngầm** theo MMR và chuỗi thắng/thua với bot.
- **LLM (Qwen)** chỉ tạo lời thoại theo sự kiện và nhận xét sau ván; luôn bất đồng bộ, có timeout và câu dự phòng; không bao giờ ảnh hưởng tới nước đi hay luồng trận.
- Chỉ ván bot chạy ở server mới có thưởng.

## Hệ quả

- ➕ Bot mạnh, phản hồi tức thì, chi phí GPU thấp (vài lần gọi mỗi trận thay vì mỗi nước).
- ➕ Bot có cá tính tiếng Việt — điểm khác biệt so với các game Dots & Boxes khác.
- ➕ Game vẫn chạy bình thường khi server LLM không khả dụng.
- ➖ Bot vẫn tồn tại ở hai ngôn ngữ (`bot.ts`, `bot.py`) → giảm rủi ro bằng fixtures tình huống dùng chung.
- ➖ Cần bộ lọc nội dung cho câu trả lời của LLM.
