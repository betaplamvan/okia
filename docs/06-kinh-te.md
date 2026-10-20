# 06 — Kinh tế & tiền tệ

## Hai loại tiền

| | **Ruột chì / Lead** (`soft`) | **Mực tím / Purple Ink** (`hard`) |
|---|---|---|
| Trạng thái | Hoạt động đầy đủ | **Khóa** cho đến khi có cổng thanh toán |
| Cách nhận | Trận đấu, nhiệm vụ, điểm danh, thưởng mùa | Chỉ từ `payment` hoặc `admin` |
| Dùng để | Mua skin thường | Mua skin cao cấp, battle pass (tương lai) |
| Đổi chéo | Không đổi sang Mực tím | (Tương lai) có thể đổi sang Ruột chì |

Chỉ bán **vật phẩm trang trí**. Không vật phẩm nào ảnh hưởng tới kết quả trận.

## Cơ chế khóa Mực tím

Quyết định: [ADR-0002](adr/0002-khoa-tien-cao-cap.md). Hệ thống được xây đầy đủ (ví, sổ cái, giá), nhưng người chơi **không có cách nào sở hữu Mực tím hay vật phẩm chỉ bán bằng Mực tím**.

### Các lớp chặn ở server (bắt buộc)

1. **Mua hàng** — `purchase(user, item, currency)`:
   - Giá của đồng tiền đó là `NULL` → `400 NOT_SOLD_IN_CURRENCY`.
   - `currencies.enabled = false` → `403 CURRENCY_LOCKED`.
2. **Cộng tiền** — `credit(user, currency, amount, source, idem_key)`:
   - `currency = 'hard'` mà `source ∉ {payment, admin}` → từ chối. Quest/sự kiện cấu hình sai cũng không thể phát Mực tím.
3. **Trang bị** — `PUT /loadout`: chỉ nhận vật phẩm có trong `inventory`.
4. **Nạp tiền** — mọi endpoint `/topup/*` trả `503` khi `PAYMENTS_ENABLED=false`.

### Test bắt buộc
- Mua bằng `hard` khi khóa → `CURRENCY_LOCKED`.
- `credit('hard', source='quest')` → bị từ chối.
- Trang bị vật phẩm chưa sở hữu → bị từ chối.
- Gọi `credit` hai lần cùng `idempotency_key` → chỉ cộng một lần.

### Mở khóa sau này
1. Tích hợp cổng thanh toán; webhook gọi `credit(user, 'hard', amount, source='payment', idem_key=<mã giao dịch>)`.
2. Bật `currencies.enabled` cho `hard` (qua một migration dữ liệu Alembic hoặc trang admin), đặt `PAYMENTS_ENABLED=true`.
3. Thông báo cho người đã "Muốn có" vật phẩm.

Không cần thay đổi schema, không sửa logic shop.

## Quy tắc ví

- Mọi thay đổi số dư: `SELECT … FOR UPDATE` dòng `wallets` → cập nhật `balance` → `INSERT wallet_ledger` — **trong cùng transaction**.
- Không bao giờ `UPDATE balance` ở chỗ nào khác.
- `idempotency_key` gợi ý: `match:{matchId}:{userId}`, `quest:{questId}:{periodKey}:{userId}`, `buy:{requestId}`.

## Nguồn Ruột chì (giá trị khởi điểm)

| Nguồn | Số lượng |
|---|---|
| Thắng (ghép trận / xếp hạng) | 30 |
| Thua (chơi hết ván) | 10 |
| Thắng bot (chỉ ván chạy ở server) | 15 |
| Phòng riêng | 0 (tránh hai acc tự cày cho nhau) |
| Nhiệm vụ ngày (3 nhiệm vụ) | 40–80 mỗi nhiệm vụ |
| Điểm danh | 20, ngày thứ 7 liên tiếp: 100 |
| **Trần từ trận đấu mỗi ngày** | **300** (không tính nhiệm vụ, điểm danh) |

Thua do `afk` hoặc đầu hàng trước nước thứ 10: không thưởng.

## Giá vật phẩm (giá trị khởi điểm)

| Độ hiếm | Ruột chì | Mực tím |
|---|---|---|
| common | 300 | — |
| rare | 800 | 40 |
| epic | 2.000 | 100 |
| legendary | — | 250 |
| reward | Không bán — chỉ nhận qua mùa giải / sự kiện |

Mỗi người chơi mới có sẵn 1 skin `default` cho mỗi loại (bút bi xanh, nét thường, ô gạch chéo, vở ô li).

## Giao diện shop

```
┌─────────────────────────────┐
│  [ảnh xem trước skin]       │
│  Bút mực tím lấp lánh   ★★★ │
│  🔒 100 Mực tím             │
│  [ Thử ]  [ ♡ Muốn có ]     │
│  Sắp mở bán                 │
└─────────────────────────────┘
```

- **Thử:** xem trên bàn mẫu, chỉ ở client, không lưu.
- **Muốn có:** ghi vào `wishlist` — dữ liệu ưu tiên làm/định giá skin khi mở bán.
- **Header:** hiện cả hai ví; Mực tím luôn `0` kèm 🔒 "Sắp ra mắt".
- **Trang nạp:** chỉ ghi "Đang phát triển", **không công khai gói nạp bằng VND** khi chưa có giấy phép (xem [10](10-phap-ly.md)).
- **Shop xoay vòng:** mỗi ngày 6 vật phẩm Ruột chì ngẫu nhiên (theo seed ngày, giống nhau cho mọi người) + toàn bộ danh mục cố định.
