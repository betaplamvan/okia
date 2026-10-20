# ADR-0007 — Thành tựu, cấp độ, rương sưu tầm và tủ trưng bày

- **Ngày:** 2026-10-20
- **Trạng thái:** Chấp nhận — **thay một phần [ADR-0005](0005-mot-tien-te-donate.md)** (điểm "Ruột chì chỉ đến từ xếp hạng"); phần còn lại của ADR-0005 (một loại tiền, không thanh toán, donate không quyền lợi) giữ nguyên.

## Bối cảnh

ADR-0005 giới hạn nguồn Ruột chì ở thắng trận xếp hạng để chống cày, nhưng để lại hệ quả: khách và người chỉ chơi casual không có tiến trình. Khảo sát noitu.fun ([06 — phụ lục](../06-kinh-te.md#phụ-lục--khảo-sát-hệ-thống-tiền-tệ-của-noitufun-2026-10-20)) cho thấy mô hình miễn phí vẫn giữ chân được người chơi nhờ **thành tựu nhiều cấp** và **sưu tầm**, không cần bán tiền.

## Quyết định

1. **Vẫn một loại tiền Ruột chì.** Nguồn: thắng xếp hạng (lặp lại) **+ thành tựu nhiều cấp** (mỗi cấp nhận đúng một lần, không cày được) + thưởng cuối mùa.
2. **EXP và cấp độ** cho mọi ván hoàn tất (kể cả với bot và phòng riêng); lên cấp mở vật phẩm `reward` (khung avatar, huy hiệu), **không** cộng Ruột chì.
3. **Rương theo bộ sưu tập** mua bằng Ruột chì: **công khai danh sách vật phẩm và tỷ lệ**, vật phẩm **trùng hoàn 50% giá rương** bằng Ruột chì. Không thêm loại tiền thứ hai. Mọi vật phẩm trong rương vẫn **mua lẻ được** trong shop.
4. **Tủ đồ** (kho, có số lượng cho vật phẩm tiêu hao) và **tủ trưng bày 3 ô** trong hồ sơ, đối thủ thấy ở màn chờ ghép trận.
5. **Vật phẩm chức năng** bán bằng Ruột chì: thẻ đổi tên (lần đầu miễn phí), thẻ avatar tùy chỉnh.
6. Quà tặng giữa người chơi: giai đoạn 3. Mini-game kiểu "Vườn Chữ": không làm.
7. Donate: không đổi (không quyền lợi trong game).

## Hệ quả

- ➕ Mọi đối tượng (khách chơi bot, người chơi casual, người chơi xếp hạng) đều có tiến trình; shop có "lý do quay lại" (rương, bộ sưu tập).
- ➕ Không ảnh hưởng pháp lý: vẫn không có tiền thật; gacha chỉ bằng tiền miễn phí, minh bạch tỷ lệ.
- ➖ Thêm 5 bảng và ~6 buổi việc ở giai đoạn 2B; cần cân bằng tỷ lệ rơi và giá rương bằng dữ liệu beta.
- ➖ Thành tựu liên quan tới bot/casual là nguồn Ruột chì mới → thiết kế thành tựu có **trần tuyệt đối** (số cấp hữu hạn), không có thành tựu lặp vô hạn.
