# 01 — Tổng quan sản phẩm

## Ý tưởng

Hai người luân phiên vẽ một cạnh giữa hai chấm kề nhau trên lưới. Ai vẽ cạnh thứ tư khép kín một ô thì ô đó thuộc về mình và được đi tiếp. Hết cạnh thì đếm ô, ai nhiều ô hơn thắng. Trò này quốc tế gọi là *Dots and Boxes* — trò dân gian, không ai giữ bản quyền luật chơi.

## Mục tiêu

- **Dễ tiếp cận:** mở link là chơi, không cài đặt, chơi khách được ngay.
- **Đã tay:** animation nét vẽ, âm thanh khi ghi điểm, combo khi ăn chuỗi.
- **Gợi nhớ tuổi học trò:** vở ô li, bút bi, mực tím, bảng đen, dấu "10 điểm".
- **Công bằng:** chỉ bán vật phẩm trang trí, không pay-to-win.

## Đối tượng

- Người chơi Việt Nam, chủ yếu 16–35 tuổi, chơi trên điện thoại qua trình duyệt.
- Giao diện **tiếng Việt (mặc định) và tiếng Anh**, responsive từ điện thoại 320px đến desktop (xem [11](11-responsive-i18n.md)).

## Ràng buộc dự án

- Dự án **cá nhân**, làm ngoài giờ (~10–15 giờ/tuần).
- Chi phí vận hành giai đoạn đầu mục tiêu **< 500.000đ/tháng**.
- **Chưa có cổng thanh toán**: tiền cao cấp được xây đầy đủ nhưng khóa (xem [06](06-kinh-te.md), [ADR-0002](adr/0002-khoa-tien-cao-cap.md)).

## Chế độ chơi

| Chế độ | Mô tả | Giai đoạn |
|---|---|---|
| Chơi với máy | Một bot duy nhất (không chia mức), độ mạnh tự điều chỉnh ngầm theo trình độ người chơi. Bot có "cá tính" nhờ LLM (giai đoạn 3) | 0 |
| Phòng riêng | Tạo phòng, chia sẻ link qua Zalo/Messenger | 1 |
| Ghép trận thường | Không tính hạng, có bot lấp chỗ khi vắng | 2 |
| Xếp hạng | Glicko-2, mùa giải, chỉ người thật | 2 |

**Không có** chế độ hai người chơi chung một thiết bị.

Kích thước bàn (tính theo số ô): **3×3** (nhanh), **5×5** (chuẩn, dùng cho xếp hạng), **7×7** (dài).

## Bản sắc

- **Tên hạng:** Giấy nháp → Vở ô li → Học sinh khá → Học sinh giỏi → Thủ khoa.
- **Tiền tệ:** *Ruột chì* (tiền thường), *Mực tím* (tiền cao cấp).
- Tên tiếng Anh tương ứng: xem [bảng thuật ngữ](11-responsive-i18n.md#bảng-thuật-ngữ).
- **Âm thanh:** tiếng bút sột soạt, trống trường khi vào trận, "ting" cao dần khi ăn chuỗi.
- Tránh tên/logo thương hiệu thật (Thiên Long, Hồng Hà…).

## Chỉ số theo dõi

- % người chơi hoàn thành ván đầu tiên
- Retention D1 / D7
- Thời gian chờ ghép trận trung bình
- Số lượt "Muốn có" theo từng vật phẩm khóa (đo nhu cầu trước khi mở bán)
