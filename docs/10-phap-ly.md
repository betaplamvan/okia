# 10 — Ghi chú pháp lý

> ⚠️ Đây là ghi chú để tự định hướng, **không phải tư vấn pháp lý**. Hỏi luật sư nếu game có lượng người chơi lớn hoặc donate đạt mức đáng kể.

## Giấy phép trò chơi điện tử

- **Nghị định 147/2024/NĐ-CP** quy định về trò chơi điện tử trên mạng. Game nhiều người chơi tương tác qua server (loại G1) cần giấy phép cung cấp dịch vụ và quyết định phê duyệt nội dung cho từng game.
- Giấy phép cấp cho **doanh nghiệp**, cá nhân không xin được.
- Dự án là cá nhân, **phi thương mại, không thu tiền dưới bất kỳ hình thức nào** ([ADR-0005](adr/0005-mot-tien-te-donate.md)) → được xem là vùng xám ở mức thấp nhất. Nếu game lớn tới mức bị chú ý, phương án là lập doanh nghiệp và xin phép khi đó.
- Không có kế hoạch thu phí, quảng cáo hay IAP, nên không phát sinh các nghĩa vụ đi kèm giấy phép thương mại.

## Donate

- Donate là **tặng cho tự nguyện**, không phải mua hàng: người ủng hộ **không nhận bất kỳ thứ gì trong game** (không huy hiệu, không Ruột chì, không skin). Trao vật phẩm đổi lấy tiền sẽ biến thành bán hàng và kéo theo nghĩa vụ giấy phép, thuế và bảo vệ người tiêu dùng.
- Trang donate ghi rõ: tiền ủng hộ dùng để trang trải chi phí vận hành; không hoàn lại; không có quyền lợi kèm theo.
- Nhận qua tài khoản cá nhân (VietQR/MoMo) là hợp lệ với cá nhân. Nếu tổng donate lớn, thu nhập cá nhân có thể phải kê khai thuế — hỏi kế toán/luật sư khi tới mức đó.
- Nền tảng quốc tế (Buy Me a Coffee, Ko-fi) có điều khoản riêng về rút tiền về Việt Nam; kiểm tra trước khi đặt link.
- Danh sách cảm ơn chỉ hiện tên do người ủng hộ **tự đăng ký**; không công khai số tiền của từng người.

## Dữ liệu cá nhân

- **Nghị định 13/2023/NĐ-CP** về bảo vệ dữ liệu cá nhân.
- Chỉ thu thập tối thiểu: tên hiển thị, avatar, **email** (để đăng nhập, xác minh và đặt lại mật khẩu), id từ Google. Không lưu số điện thoại.
- Mật khẩu chỉ lưu dạng băm Argon2id; không bao giờ ghi log mật khẩu hay token.
- Email **chỉ dùng cho bảo mật tài khoản**, không gửi tiếp thị; chính sách ghi rõ đơn vị gửi email (Resend, máy chủ ở nước ngoài).
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
