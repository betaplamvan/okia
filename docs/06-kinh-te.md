# 06 — Kinh tế trong game & donate

Quyết định: [ADR-0005](adr/0005-mot-tien-te-donate.md) (thay thế ADR-0002).

## Nguyên tắc

- **Một loại tiền duy nhất: Ruột chì** (`lead`). Hoàn toàn miễn phí, **không có cách nào mua bằng tiền thật**.
- **Không có cổng thanh toán**, không bán vật phẩm, không battle pass, không quảng cáo. Game không có doanh thu; chi phí vận hành bù bằng **donate** tự nguyện, không đổi lấy gì trong game.
- Chỉ có **vật phẩm trang trí**. Không vật phẩm nào ảnh hưởng tới kết quả trận.

## Ruột chì

### Nguồn (giá trị khởi điểm)

| Nguồn | Số lượng |
|---|---|
| **Thắng trận xếp hạng** | 30 |
| Thắng 5 trận phân hạng đầu mùa | 30 mỗi trận (như trận xếp hạng thường) |
| Thưởng cuối mùa theo `peak_tier` | Giấy nháp 100 · Vở ô li 200 · Học sinh khá 350 · Học sinh giỏi 500 · Thủ khoa 800 |
| Thua trận xếp hạng | 0 |
| Ghép trận thường, chơi với máy, phòng riêng | 0 |

Tất cả Ruột chì đều đến từ **xếp hạng**, và đây là chủ đích thiết kế:
- **Tài khoản khách không chơi xếp hạng, nên không kiếm được Ruột chì và không mua được skin.** Khách dùng để chơi thử (casual, bot, phòng riêng); muốn có tiến trình thì tạo tài khoản (email đã xác minh) hoặc đăng nhập Google ([13](13-xac-thuc.md)). Điều này vừa chống cày tiền bằng nhiều tài khoản, vừa là lý do tự nhiên để người chơi đăng nhập.
- Giao diện nói rõ điều này ở màn hình chọn chế độ và trong shop ("Tạo tài khoản để chơi xếp hạng và nhận Ruột chì"), không giấu.
- Người đã liên kết nhưng chỉ chơi casual cũng không có tiến trình. Nếu dữ liệu beta cho thấy điều này làm mất người chơi, có thể cân nhắc nguồn phụ nhỏ cho casual. *Mặc định không làm.*

### Chống lạm dụng
- Thu nhập gắn với thắng xếp hạng nên **dàn xếp kết quả (win-trading)** là rủi ro chính → phát hiện cặp tài khoản gặp nhau bất thường (xem [07](07-xep-hang-ghep-tran.md#chống-gian-lận)); trận bị đánh dấu không trả thưởng cho đến khi được xem xét.
- Không trả thưởng khi ván kết thúc bằng `afk`, hoặc đối thủ đầu hàng trước nước thứ 10.
- Không cần trần ngày: số trận xếp hạng thắng được mỗi ngày tự giới hạn bởi thời gian chơi.

## Quy tắc ví

- Một dòng `wallets` mỗi người chơi; mọi thay đổi số dư: `SELECT … FOR UPDATE` → cập nhật `balance` → `INSERT wallet_ledger` **trong cùng transaction**.
- Không bao giờ `UPDATE balance` ở chỗ nào khác.
- `credit(user, amount, source, ref, idem_key)` với `source ∈ {match, season, admin}`; `debit(user, amount, source='purchase', ref=item_id, idem_key)`.
- `idempotency_key` gợi ý: `match:{matchId}:{userId}`, `season:{seasonId}:{userId}`, `buy:{requestId}`.

### Test bắt buộc
- Gọi `credit` hai lần cùng `idempotency_key` → chỉ cộng một lần.
- `debit` quá số dư → từ chối `INSUFFICIENT_FUNDS`, không đổi số dư.
- Thắng casual / bot / phòng riêng → không có dòng ledger.
- Trận bị đánh dấu win-trading → không có dòng ledger.

## Vật phẩm & giá (giá trị khởi điểm)

| Độ hiếm | Giá (Ruột chì) | Số trận thắng tương đương |
|---|---|---|
| common | 150 | 5 |
| rare | 450 | 15 |
| epic | 1.200 | 40 |
| legendary | 3.000 | 100 |
| reward | Không bán — chỉ nhận qua mùa giải / sự kiện | — |

- Mỗi người chơi mới có sẵn 1 skin `default` cho mỗi loại (bút bi xanh, nét thường, ô gạch chéo, vở ô li).
- Mọi vật phẩm có giá đều **mua được ngay**; không có vật phẩm khóa.

## Shop

```
┌─────────────────────────────┐
│  [ảnh xem trước skin]       │
│  Bút mực tím            ★★★ │
│  ✏ 450 Ruột chì             │
│  [ Thử ]       [ Mua ]      │
└─────────────────────────────┘
```

- **Thử:** xem skin trên bàn mẫu, chỉ ở client, không lưu.
- **Mua:** xác nhận → `debit` → thêm `inventory` → đề nghị trang bị ngay.
- **Header:** hiện số Ruột chì và lối tắt tới shop.
- **Shop xoay vòng:** mỗi ngày 6 vật phẩm ngẫu nhiên (theo seed ngày, giống nhau cho mọi người) **giảm 20%** + toàn bộ danh mục cố định. Mục đích là tạo lý do quay lại, không phải tạo khan hiếm.

## Donate

- Trang `/donate` (vi: "Ủng hộ") với lời cảm ơn và các kênh: **VietQR chuyển khoản ngân hàng**, **MoMo**, và một kênh quốc tế (Buy Me a Coffee hoặc Ko-fi) cho người dùng giao diện tiếng Anh.
- Link và mã QR đặt trong `web/src/config/donate.ts`; đổi không cần sửa backend.
- **Donate không đổi lấy bất kỳ thứ gì trong game** — không huy hiệu, không Ruột chì, không skin. Lý do: trao vật phẩm đổi lấy tiền sẽ trở thành bán hàng và kéo theo nghĩa vụ pháp lý ([10](10-phap-ly.md#donate)).
- Có thể có **danh sách cảm ơn** trên trang `/donate`, chỉ với người **tự nguyện đăng ký** tên hiển thị; không nhập liên kết với tài khoản game.
- Trang ghi rõ chi phí vận hành hằng tháng (VPS, tên miền) để minh bạch.
- Lời mời donate xuất hiện **tối đa một lần** ở màn hình kết thúc trận, sau khi người chơi đã chơi ≥ 20 ván, và tắt được. Không bao giờ chen vào giữa trận.
