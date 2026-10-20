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

## Phụ lục — Khảo sát hệ thống tiền tệ của noitu.fun (2026-10-20)

Khảo sát trực tiếp trên site (Tạp Hóa, hồ sơ, trang Ủng hộ). Ghi lại để học cấu trúc, không sao chép nội dung.

### Họ có gì

| Thành phần | Cách noitu làm |
|---|---|
| **Hai loại tiền, đều miễn phí** | **Xu** (vàng) là tiền chính; **Kim cương** (tím) là tiền phụ, nhận khi mở rương ra vật phẩm **trùng** (và một số nguồn khác). Không có nạp tiền để mua xu/kim cương |
| **Nguồn xu** | Chủ yếu qua **Thành tựu** nhiều cấp (0/8): "Bất bại" (thắng xếp hạng liên tiếp), "Thích thi cử" (chơi 50 trận xếp hạng), "Đấm Bot" (đạt 50 điểm với bot), "Hướng ngoại" (kết bạn), "Rộng lượng" (tặng quà), "Người đóng góp" (góp từ vào từ điển, +25 xu)… mỗi cấp +2 đến +25 xu. Ngoài ra: **EXP / cấp độ** (Lv, thanh 0/50), **giftcode**, "Vườn Chữ" |
| **Tạp Hóa** | Bán bằng xu: vật phẩm chức năng (Thẻ đổi tên 500, Thẻ upload avatar 1000), bộ sticker chat (200), vật phẩm cho "Vườn Chữ" (mầm 20 kim cương, bình xịt 20 xu, phân bón 20 xu) |
| **Rương** (gacha) | 8 loại rương theo chủ đề (Thẻ Đông Hồ, Sơn Mài, Mèo Lầy, Thiên Hà…), giá 100–800 xu, **liệt kê rõ danh sách vật phẩm có thể nhận** (21–26 món), "mỗi rương có món đặc biệt riêng"; **trùng → quy đổi kim cương**; rương "mầm non" **giá tăng mỗi lần mua trong ngày** |
| **Tủ Đồ** | Kho vật phẩm đã có, kể cả rương chưa mở ("mở ngay hoặc cất") |
| **Tủ trưng bày** | 3 ô trong hồ sơ để khoe vật phẩm sưu tầm |
| **Vườn Chữ** | Mini-game "trồng cây": mua mầm bằng kim cương, bón/xịt bằng xu, cây nở ra chữ bán lấy xu; hàng xóm tưới giùm (thành tựu "Hàng xóm tốt bụng") |
| **Quà tặng** | Người chơi tặng vật phẩm cho nhau; có thành tựu cho cả người tặng lẫn người nhận |
| **Ủng hộ** | 20k/30k/50k đ → 3/6/12 tháng **không quảng cáo** + vật phẩm kỷ niệm "Trống Đồng Tri Ân" (không bán ở đâu); thanh toán VietQR / MoMo / ZaloPay; cần liên kết Google trước; danh sách cảm ơn |

### Nhận xét

- Họ **không bán tiền**: toàn bộ xu/kim cương đến từ chơi. Doanh thu là quảng cáo + ủng hộ (đổi lấy tắt quảng cáo). Mô hình này gần với ADR-0005 của ta, khác ở chỗ ta không có quảng cáo nên donate không có gì để "tắt".
- Động cơ chính không phải thắng trận mà là **thành tựu nhiều cấp** + **sưu tầm** (rương theo bộ, tủ trưng bày, trùng được đền). Người chơi casual cũng có tiến trình.
- Gacha bằng tiền miễn phí: rủi ro pháp lý thấp vì không có tiền thật; họ minh bạch danh sách vật phẩm và đền trùng → giảm bực bội.
- "Giá tăng mỗi lần mua trong ngày" là cách chặn cày không cần trần ngày cứng.

### Đề xuất cho Ô Kìa (chưa chốt — cần quyết định)

1. **Giữ một loại tiền Ruột chì**, nhưng **mở thêm nguồn thu có trần tự nhiên**: *thành tựu nhiều cấp* (thắng bot 5×5 lần đầu, ăn combo ×4, thắng 3 trận xếp hạng liên tiếp, chơi 50 ván, mời 1 bạn vào phòng riêng…). Thành tựu chỉ nhận **một lần mỗi cấp** nên không cày được; giải quyết việc khách và người chơi casual không có tiến trình. Thắng xếp hạng vẫn là nguồn lặp lại duy nhất.
2. **Cấp độ (EXP)**: mọi ván hoàn tất cộng EXP (không cộng Ruột chì); lên cấp mở khung avatar/huy hiệu — tiến trình "miễn phí" cho casual mà không làm loãng kinh tế.
3. **Rương theo bộ sưu tập** (Bộ Bút Bi, Bộ Mực Tím, Bộ Phấn Trắng…) mua bằng Ruột chì, **công khai danh sách và tỷ lệ**, **trùng → hoàn 50% giá rương bằng Ruột chì** (không thêm loại tiền thứ hai để giữ đơn giản). Vẫn giữ mua lẻ trong shop cho ai không thích rương.
4. **Tủ đồ + tủ trưng bày (3 ô) trong hồ sơ**, hiện cho đối thủ thấy ở màn chờ ghép trận.
5. **Vật phẩm chức năng** bán bằng Ruột chì: thẻ đổi tên (1 lần đổi miễn phí, sau đó mua), avatar tùy chỉnh.
6. **Quà tặng giữa người chơi** để sau (giai đoạn 3) vì cần tài khoản + bạn bè.
7. **Donate**: giữ nguyên ADR-0005 (không quyền lợi trong game). Nếu muốn học noitu ở điểm "vật phẩm kỷ niệm cho người ủng hộ", cần đọc lại [10](10-phap-ly.md#donate): vật phẩm đổi lấy tiền có thể bị xem là bán hàng — không khuyến nghị khi chưa có pháp nhân.
8. **Không làm** mini-game kiểu "Vườn Chữ" ở giai đoạn đầu: tốn công, lệch trọng tâm.

Nếu chốt 1–5, cần cập nhật: [05](05-co-so-du-lieu.md) (bảng `achievements`, `user_achievements`, `chests`, `exp`), [09](09-lo-trinh.md) (giai đoạn 2B), và ADR mới thay một phần ADR-0005 ("Ruột chì chỉ từ xếp hạng" → "xếp hạng + thành tựu một lần").
