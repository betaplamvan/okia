# 10 — Ghi chú pháp lý

> ⚠️ Đây là ghi chú để tự định hướng, **không phải tư vấn pháp lý**. Cần hỏi luật sư trước khi mở thu phí.

## Giấy phép trò chơi điện tử

- **Nghị định 147/2024/NĐ-CP** quy định về trò chơi điện tử trên mạng. Game nhiều người chơi tương tác qua server (loại G1) cần giấy phép cung cấp dịch vụ và quyết định phê duyệt nội dung cho từng game.
- Giấy phép cấp cho **doanh nghiệp**, cá nhân không xin được.
- Dự án hiện là cá nhân, phi thương mại → được xem là vùng xám. Hướng xử lý:
  - Không thu tiền dưới bất kỳ hình thức nào cho đến giai đoạn 4.
  - Không công khai gói nạp hay bảng giá bằng VND.
  - Khi có người chơi ổn định → lập doanh nghiệp và xin phép **trước** khi bật thanh toán.
- Khi có giấy phép, có thể phát sinh các nghĩa vụ khác (xác thực tài khoản, giới hạn thời gian chơi cho người dưới 18 tuổi…). Kiểm tra lại văn bản hiện hành lúc đó.

## Thanh toán

- VNPay, MoMo, ZaloPay, PayOS… thường yêu cầu đăng ký kinh doanh.
- Nếu sau này đóng gói app iOS/Android: vật phẩm số bắt buộc qua Apple/Google IAP.
- Quảng cáo (AdSense) ít rủi ro hơn bán tiền ảo, nhưng vẫn nên hỏi luật sư trước khi bật.

## Dữ liệu cá nhân

- **Nghị định 13/2023/NĐ-CP** về bảo vệ dữ liệu cá nhân.
- Chỉ thu thập tối thiểu: tên hiển thị, avatar, id từ Google/Zalo. Không lưu số điện thoại, email nếu không cần.
- Có trang **chính sách quyền riêng tư** và chức năng **xóa tài khoản** từ giai đoạn 1.
- Ghi rõ có dùng Sentry/PostHog (dịch vụ nước ngoài) trong chính sách.

## Nội dung do AI tạo (bot LLM)

- Ghi rõ lời thoại và nhận xét của bot là **do AI tạo**.
- Không gửi dữ liệu cá nhân người chơi (tên, id tài khoản) vào prompt.
- Mọi câu trả lời của LLM đi qua bộ lọc từ ngữ và giới hạn độ dài trước khi hiển thị; người chơi tắt được lời thoại bot.

## Nội dung & thương hiệu

- Luật chơi Dots & Boxes là trò dân gian, dùng tự do.
- Không dùng tên, logo, kiểu dáng đặc trưng của thương hiệu thật (Thiên Long, Hồng Hà…) trong skin.
- Âm thanh, font, hình ảnh: chỉ dùng nguồn có giấy phép rõ ràng (CC0, tự làm, hoặc mua bản quyền). Ghi nguồn trong `docs/credits.md` khi bắt đầu thêm asset.
- Tên hiển thị người chơi: lọc từ ngữ thô tục cơ bản; không có chat tự do (chỉ emote cố định).
