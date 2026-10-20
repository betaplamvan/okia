# 07 — Xếp hạng & ghép trận

## Glicko-2

- Mỗi người chơi có `mmr` (khởi điểm 1500), `rd` (độ không chắc chắn, 350), `vol` (0.06). Hằng số hệ thống `τ = 0.5`.
- Cập nhật **sau mỗi trận** (coi mỗi trận là một kỳ đánh giá). Kết quả: thắng 1, hòa 0.5, thua 0.
- Chỉ chế độ **xếp hạng** cập nhật `ratings`. Chế độ thường dùng MMR ẩn riêng (`casual`) để ghép trận, không hiển thị.
- `rd` tăng dần khi không chơi (áp dụng lúc người chơi quay lại), nên người nghỉ lâu sẽ dịch chuyển hạng nhanh hơn.
- Code: `api/app/rating/glicko2.py`, kèm test so với ví dụ trong paper gốc của Glickman.

## Hạng hiển thị

Hạng tính từ **điểm hiển thị** `display = mmr - 2 × rd`. Như vậy người mới (rd lớn) bắt đầu ở hạng thấp và "leo" lên dần khi hệ thống chắc chắn hơn.

| Hạng | Điểm hiển thị | Bậc |
|---|---|---|
| Giấy nháp | < 1100 | III, II, I |
| Vở ô li | 1100 – 1350 | III, II, I |
| Học sinh khá | 1350 – 1600 | III, II, I |
| Học sinh giỏi | 1600 – 1850 | III, II, I |
| Thủ khoa | ≥ 1850 | — (hiện thứ hạng trên BXH) |

Tên tiếng Anh: xem [bảng thuật ngữ](11-responsive-i18n.md#bảng-thuật-ngữ). Mỗi bậc chia đều khoảng điểm của hạng. **5 trận phân hạng** đầu mùa chưa hiện hạng. *Ngưỡng là giá trị khởi điểm, chỉnh theo phân phối thực tế.*

## Mùa giải

- Dài 6–8 tuần, tên theo chủ đề trường học (Học kỳ I, Thi giữa kỳ, Mùa hè…).
- **Reset mềm:** `mmr_mới = 1500 + (mmr_cũ - 1500) × 0.5`, `rd_mới = max(rd_cũ, 150)`.
- Thưởng cuối mùa theo `peak_tier`: vật phẩm `reward` độc quyền (khung, dấu ô) + Ruột chì. Không thưởng Mực tím.

## Ghép trận

Worker nền `matchmaking` (một bản duy nhất nhờ `lock:mm`) chạy mỗi **1 giây** với từng hàng chờ `mm:{mode}:{board}`:

1. Duyệt người chơi theo thời gian chờ giảm dần.
2. Cửa sổ MMR: `window = 50 + 25 × floor(chờ_giây / 5)`, tối đa **400**.
3. Ghép với người gần MMR nhất nằm trong cả cửa sổ của mình **và** cửa sổ của họ.
4. Không ghép hai người vừa gặp nhau ở trận liền trước (trừ khi chờ > 60 giây).
5. Ghép xong: xóa cả hai khỏi hàng chờ (`ZREM` trong transaction), tạo `room:{id}`, gửi `matched`.

### Khi vắng người

| Chế độ | Chờ > 30 giây |
|---|---|
| Ghép trận thường | Hỏi "Chơi với máy trong lúc chờ?" — bot tự chỉnh độ mạnh theo MMR (xem [03 — Bot](03-luat-choi.md#bot)), **ghi rõ là máy** |
| Xếp hạng | Tiếp tục chờ, hiện số người đang online; **không bao giờ dùng bot** |

### Chống gian lận
- Server kiểm tra mọi nước đi (xem [03](03-luat-choi.md)).
- Rate limit `move` (tối đa 5 tin/giây).
- Phát hiện **dàn xếp kết quả**: cặp tài khoản gặp nhau > 5 trận xếp hạng/ngày với kết quả một chiều → đánh dấu để xem xét.
- Tài khoản khách **không được chơi xếp hạng** — phải liên kết Google/Zalo.
