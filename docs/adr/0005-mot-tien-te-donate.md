# ADR-0005 — Một loại tiền miễn phí, bỏ hẳn thanh toán, nhận donate

- **Ngày:** 2026-10-20
- **Trạng thái:** Chấp nhận — **thay thế [ADR-0002](0002-khoa-tien-cao-cap.md)**; điểm "Ruột chì chỉ từ xếp hạng" được **mở rộng bởi [ADR-0007](0007-thanh-tuu-cap-do-ruong.md)** (thêm thành tựu một lần, EXP, rương)

## Bối cảnh

ADR-0002 xây hai loại tiền và khóa tiền cao cấp chờ cổng thanh toán. Sau khi cân nhắc lại:
- Thu phí đòi hỏi lập doanh nghiệp và xin giấy phép G1 — quá nặng cho một dự án cá nhân, và chưa chắc bao giờ làm.
- Giữ một hệ thống "khóa chờ" làm schema, shop và giao diện phức tạp hơn mà không mang lại giá trị trước mắt; vật phẩm khóa còn gây khó chịu cho người chơi.
- Chi phí vận hành thấp (< 500.000đ/tháng) có thể bù bằng donate tự nguyện.

## Quyết định

- **Một loại tiền: Ruột chì**, chỉ kiếm được qua **thắng trận xếp hạng** và thưởng cuối mùa.
- **Bỏ hoàn toàn** tiền cao cấp, cổng thanh toán, battle pass, wishlist, và cờ `PAYMENTS_ENABLED`. Xóa bảng `currencies`; `wallets` và `wallet_ledger` không còn cột tiền tệ; `items` chỉ có một cột `price`.
- **Donate** qua trang `/donate` (VietQR, MoMo, Buy Me a Coffee/Ko-fi); **không đổi lấy gì trong game**.
- Lộ trình giai đoạn 4 đổi từ "Kiếm tiền" thành "Donate & duy trì".

## Hệ quả

- ➕ Schema và shop đơn giản hơn đáng kể; không có vật phẩm khóa; không còn rủi ro pháp lý về thu phí.
- ➕ Không pay-to-win là tuyệt đối, dễ truyền thông.
- ➖ Không có doanh thu; dự án phụ thuộc vào donate và chi phí thấp.
- ➖ Chỉ xếp hạng mới cho tiền → tài khoản khách và người chỉ chơi casual không có tiến trình; phải nói rõ trong giao diện và theo dõi dữ liệu beta để quyết định có thêm nguồn phụ không.
- ➖ Dàn xếp kết quả trở thành rủi ro chính của kinh tế → phát hiện win-trading là bắt buộc trước beta công khai.

## Bổ sung 2026-10-23: trang donate và nhận biết tiền vào

Trang `/donate` với VietQR sinh tại client, bảng cảm ơn tự động từ webhook SePay (ngân hàng Việt Nam) và Ko-fi (quốc tế) — xem [docs/10 — Donate](../10-phap-ly.md#donate). Giữ nguyên nguyên tắc: không đổi lấy gì trong game, không hiện số tiền, tên chỉ hiện khi người ủng hộ tự ghi. Không dùng API ngân hàng không chính thức (giả lập app) và không dùng MoMo/ZaloPay Business (cần đăng ký kinh doanh).
