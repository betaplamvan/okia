# 06 — Kinh tế trong game & donate

Quyết định: [ADR-0005](adr/0005-mot-tien-te-donate.md) (không thanh toán, donate) + [ADR-0007](adr/0007-thanh-tuu-cap-do-ruong.md) (thành tựu, cấp độ, rương, tủ trưng bày) + [ADR-0010](adr/0010-hai-tien-diem-danh-nhiem-vu.md) (**hai loại tiền**, điểm danh, nhiệm vụ, ảnh đại diện).

## Nguyên tắc

- **Hai loại tiền, đều miễn phí, không có cách nào mua bằng tiền thật:** **Ruột chì** (`lead`, tiền chính) và **Hoa điểm tốt** (`flower`, tiền phụ hiếm — xem [ADR-0010](adr/0010-hai-tien-diem-danh-nhiem-vu.md)).
- **Không có cổng thanh toán**, không bán vật phẩm, không battle pass, không quảng cáo. Chi phí vận hành bù bằng **donate** tự nguyện, không đổi lấy gì trong game.
- Chỉ có **vật phẩm trang trí và chức năng** (đổi tên, avatar). Không vật phẩm nào ảnh hưởng tới kết quả trận.
- Động cơ chính: **thành tựu nhiều cấp** và **sưu tầm theo bộ** (học từ noitu.fun, xem phụ lục).

## Ruột chì

### Nguồn (giá trị khởi điểm)

| Nguồn | Số lượng | Lặp lại? |
|---|---|---|
| **Thắng trận xếp hạng** (đã làm: `rating.service.settle`, không thưởng afk / đầu hàng trước nước 10) | 30 | Có — nguồn lặp lại duy nhất |
| Thắng 5 trận phân hạng đầu mùa | 30 mỗi trận | Mỗi mùa |
| **Thành tựu** (xem bảng dưới) | 10–100 mỗi cấp | **Không** — mỗi cấp nhận đúng một lần |
| Thưởng cuối mùa theo `peak_tier` | Giấy nháp 100 · Vở ô li 200 · Học sinh khá 350 · Học sinh giỏi 500 · Thủ khoa 800 | Mỗi mùa |
| **Điểm danh** mỗi ngày | 10 / 10 / 15 / 15 / 20 / 20 / 30 theo ngày trong chu kỳ 7 ngày | Hằng ngày |
| **Nhiệm vụ** ngày (3) / tuần (3) | 10–15 mỗi nhiệm vụ ngày; 30–50 nhiệm vụ tuần | Hằng ngày / tuần |
| Vật phẩm trùng khi mở rương | 0 Ruột chì — nhận **Hoa điểm tốt** (xem dưới) | Theo rương |
| Thua trận xếp hạng; ván casual/bot/phòng riêng | 0 (chỉ nhận EXP) | — |

- **Khách** (chưa tài khoản) vẫn nhận tiến trình thành tựu và EXP **tại chỗ**; khi tạo tài khoản, tiến trình đó được giữ (gộp tài khoản — [13](13-xac-thuc.md#gộp-tài-khoản)). Khách không chơi xếp hạng và **không mở được shop/rương** cho tới khi có tài khoản — đây là lý do tự nhiên để đăng ký.
- Trần tự nhiên: thành tựu có số cấp hữu hạn; xếp hạng tự giới hạn bởi thời gian chơi → **không cần trần ngày**.

## Hoa điểm tốt

Tiền phụ, hiếm, không mua được. Nguồn: ngày 7 của chu kỳ điểm danh (1), nhiệm vụ tuần "Chăm chỉ" (1) và "Đều đặn" (1), vật phẩm trùng khi mở rương (1–3 theo độ hiếm rương; giai đoạn 2B). Dùng mua vật phẩm giới hạn/huyền thoại và một số thẻ. Tối đa ≈ 3 Hoa/tuần ngoài rương.

## Điểm danh & nhiệm vụ ([ADR-0010](adr/0010-hai-tien-diem-danh-nhiem-vu.md))

- **Điểm danh:** `POST /me/checkin` một lần/ngày (ngày theo giờ Việt Nam). Chuỗi liên tiếp quyết định ngày trong chu kỳ 7; lỡ một ngày → về ngày 1. Bảng thưởng ở `api/app/economy/checkin.py`.
- **Nhiệm vụ** (`api/app/economy/quests.py`, tên/mô tả trong catalog i18n `quests.*`):

| Id | Kỳ | Điều kiện | Thưởng |
|---|---|---|---|
| `d_play3` | ngày | chơi xong 3 ván | 10 Ruột chì |
| `d_win1` | ngày | thắng 1 ván | 15 Ruột chì |
| `d_combo3` | ngày | combo ≥ 3 trong một lượt | 10 Ruột chì |
| `w_play15` | tuần | chơi xong 15 ván | 30 Ruột chì + 1 Hoa |
| `w_win_online3` | tuần | thắng 3 ván online | 50 Ruột chì |
| `w_daily5` | tuần | nhận 5 nhiệm vụ ngày | 1 Hoa |

- Tiến trình: phòng online do server ghi khi `game_over` (bỏ `afk` và đầu hàng trước nước 10); ván với máy do client báo `POST /me/events` (≤ 30/giờ, ván ≥ 24 nước) cho tới khi bot chạy ở server (P2-06).
- `GET /me/progress` trả ví + điểm danh + nhiệm vụ + mốc reset; nhận thưởng qua `POST /me/checkin`, `POST /me/quests/{id}/claim` — chỉ tài khoản **đã xác minh email**; khách và chưa xác minh vẫn thấy tiến trình.
- Giao diện (học noitu, 2026-10-21): hộp **"Quà mỗi ngày"** riêng (`web/src/components/economy/gift-dialog.tsx`), mở từ nút hộp quà trang chủ, không dính hồ sơ. Nút chia đôi *Điểm danh* / *Nhiệm vụ*, mục còn thưởng có chấm đỏ. Điểm danh: dòng "Chuỗi: n ngày" + "Kỷ lục: n" (`checkin.bestStreak` = max streak từng đạt), lưới 7 thẻ ngày (đã nhận tô mint, hôm nay viền đậm, ngày 7 viền vàng + hộp quà), nút rộng "Điểm danh hôm nay" / "Đã điểm danh hôm nay ✓". Nhiệm vụ: thẻ có icon tròn, tên, thanh tiến trình + số, chip thưởng; bên phải "Chơi ngay" (chưa đủ → /play hoặc /ranked) / "Nhận" (đủ, thẻ tô vàng nhạt) / "Đã nhận". Trang chủ: nút ví (Ruột chì ‖ Hoa điểm tốt → cửa hàng), nút hộp quà có chấm đỏ khi còn điểm danh/nhiệm vụ chưa nhận (xem [14](14-thiet-ke-giao-dien.md)). Hồ sơ chỉ còn tab Tổng quan / Hạng / Tài khoản.

### Thành tựu (bộ khởi điểm, mỗi thành tựu 5 cấp)

| Thành tựu | Chỉ số | Mốc cấp 1→5 | Ruột chì mỗi cấp |
|---|---|---|---|
| Nét đầu tiên | Ván hoàn tất (mọi chế độ) | 1 / 10 / 50 / 200 / 500 | 10 / 20 / 40 / 60 / 100 |
| Đấm máy | Thắng bot | 1 / 5 / 20 / 50 / 100 | 10 / 20 / 30 / 50 / 80 |
| Ô kìa! | Combo lớn nhất trong một lượt | 2 / 3 / 4 / 6 / 8 | 10 / 20 / 40 / 60 / 100 |
| Thi cử | Trận xếp hạng đã chơi | 1 / 10 / 50 / 200 / 500 | 20 / 30 / 50 / 80 / 100 |
| Bất bại | Thắng xếp hạng liên tiếp (kỷ lục) | 2 / 3 / 5 / 8 / 12 | 20 / 30 / 50 / 80 / 100 |
| Lên lớp | Hạng cao nhất đạt được | Vở ô li / HS khá / HS giỏi / Thủ khoa / Top 100 | 30 / 50 / 80 / 100 / 100 |
| Rủ bạn | Ván phòng riêng hoàn tất với người khác | 1 / 5 / 20 / 50 / 100 | 10 / 20 / 30 / 50 / 80 |
| Nhà sưu tầm | Vật phẩm sở hữu | 3 / 10 / 25 / 50 / 100 | 10 / 20 / 40 / 60 / 100 |
| Trọn bộ | Bộ sưu tập hoàn chỉnh | 1 / 2 / 3 / 5 / 8 | 50 / 60 / 80 / 100 / 100 |

Tổng Ruột chì tối đa từ thành tựu khởi điểm ≈ 2.300 (tương đương ~77 trận thắng). Thành tựu tính cho cả khách; chỉ số được đếm ở server khi có tài khoản, ở client khi là khách (và gửi lên lúc gộp tài khoản — server kiểm tra hợp lý: không vượt số ván đã ghi nhận).

### EXP & cấp độ

- Mọi ván **hoàn tất** cộng EXP: bot 10 · phòng riêng 20 · casual 20 · xếp hạng 30; thắng +10. Không cộng khi `afk`/đầu hàng sớm.
- Cấp `n` cần `50 × n` EXP (cấp 1→2: 50, 2→3: 100…). Hiển thị "Lv" + thanh EXP trong pill và hồ sơ.
- Mốc cấp 5 / 10 / 20 / 30 / 50 mở vật phẩm `reward`: khung avatar, huy hiệu, dấu ô đặc biệt. **Không** cộng Ruột chì.

### Chống lạm dụng
- Thu nhập lặp lại duy nhất gắn với thắng xếp hạng → **dàn xếp kết quả** vẫn là rủi ro chính → phát hiện cặp tài khoản gặp nhau bất thường ([07](07-xep-hang-ghep-tran.md#chống-gian-lận)); trận bị cờ không trả thưởng/EXP/tiến trình thành tựu.
- Không trả thưởng khi ván kết thúc bằng `afk`, hoặc đối thủ đầu hàng trước nước thứ 10.
- Thành tựu bot/phòng riêng: đếm ván **hoàn tất** (đi hết cạnh), ván 3×3 tối thiểu 24 nước nên không thể spam trong vài giây.

## Quy tắc ví

- Một dòng `wallets` mỗi người chơi; mọi thay đổi số dư: `SELECT … FOR UPDATE` → cập nhật `balance` → `INSERT wallet_ledger` **trong cùng transaction**.
- Không bao giờ `UPDATE balance` ở chỗ nào khác.
- `credit(user, currency, amount, source, ref, idem_key)` với `source ∈ {match, season, achievement, checkin, quest, chest_refund, admin}`; `debit(user, currency, amount, source ∈ {purchase, chest}, ref, idem_key)`; `grant(user, {lead, flower}, …)` cộng một gói (mỗi loại một dòng ledger, khóa + hậu tố `:lead` / `:flower`). **Đã làm:** `api/app/economy/wallet.py`.
- `idempotency_key` gợi ý: `match:{matchId}:{userId}`, `season:{seasonId}:{userId}`, `ach:{achievementId}:{tier}:{userId}`, `checkin:{userId}:{YYYY-MM-DD}`, `quest:{userId}:{questId}:{period}`, `chest:{openId}`, `buy:{requestId}`.

### Test bắt buộc
- Gọi `credit` hai lần cùng `idempotency_key` → chỉ cộng một lần.
- `debit` quá số dư → từ chối `INSUFFICIENT_FUNDS`, không đổi số dư.
- Thắng casual / bot / phòng riêng → không có dòng ledger (chỉ EXP).
- Nhận thưởng cùng một cấp thành tựu hai lần → lần hai bị từ chối.
- Mở rương: tổng tỷ lệ = 100%; vật phẩm trùng → hoàn đúng 50% giá; không trùng → vào `inventory`.
- Trận bị đánh dấu win-trading → không có dòng ledger, không EXP.

## Vật phẩm

### Loại và giá (giá trị khởi điểm)

| Loại | Ví dụ | Giá lẻ (Ruột chì) |
|---|---|---|
| `pen` / `box` (skin, [08](08-skin.md), ADR-0013 — **đã làm**) | theo bậc hiếm | trắng 100 · xanh lá 250 · xanh lam 600 · tím 1.500 Ruột chì · **vàng 5 Hoa điểm tốt** |
| `frame` (khung avatar), `badge` (huy hiệu) | chỉ từ cấp độ / mùa / thành tựu | không bán (`reward`) |
| `card` — vật phẩm tiêu hao | Thẻ đổi tên 500 (lần đổi đầu miễn phí). Ảnh đại diện tự tải **miễn phí** (ADR-0010) | có `quantity` |
| `reward` | khung mùa giải, dấu ô kỷ niệm | không bán |

- Mỗi người chơi mới có sẵn 1 skin `default` mỗi loại và 1 lần đổi tên miễn phí.
- Mọi vật phẩm có giá đều **mua được ngay**; không có vật phẩm khóa.

### Rương (bộ sưu tập)

- Mỗi rương là một **bộ** có chủ đề (khởi điểm 3 bộ: *Bộ Bút Bi*, *Bộ Mực Tím*, *Bộ Phấn Trắng*; sau đó *Bộ Giấy Kiểm Tra*, *Bộ Khai Giảng*…), 12–20 vật phẩm/bộ gồm đủ 4 loại skin + 1 huy hiệu "trọn bộ" chỉ có khi sưu tầm đủ.
- Giá khởi điểm 300 (common-heavy) đến 800 (có epic). **Tỷ lệ công khai** trên thẻ rương: ví dụ common 70% · rare 25% · epic 5%; danh sách đầy đủ vật phẩm có thể nhận.
- **Trùng → nhận Hoa điểm tốt** (1 với rương common-heavy, 2–3 với rương có epic), ghi ledger `chest_refund` (ADR-0010 thay cho hoàn 50% Ruột chì). Vật phẩm trong bộ vẫn mua lẻ được.
- Rương "Vở nháp" 100 Ruột chì: **giá tăng 50% sau mỗi lần mua trong ngày** (100 → 150 → 225…), reset 0h — cách chặn cày học từ noitu, không cần trần ngày cứng.
- Mỗi lần mở là một bản ghi `chest_opens` (kiểm toán được). Server chọn vật phẩm bằng RNG có seed ghi lại.

### Tủ đồ & tủ trưng bày

- **Tủ đồ**: toàn bộ vật phẩm sở hữu, lọc theo loại/bộ; vật phẩm tiêu hao hiện số lượng; nút "Dùng" cho thẻ.
- **Tủ trưng bày**: 3 ô trong hồ sơ; chọn vật phẩm bất kỳ (kể cả khung, huy hiệu) để khoe; đối thủ thấy ở màn chờ ghép trận và màn kết thúc.

## Shop

```
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  [ảnh xem trước skin]       │   │  📦 Bộ Mực Tím      ★ 14 món │
│  Bút mực tím            ★★★ │   │  common 70% · rare 25% ·     │
│  ✏ 450 Ruột chì             │   │  epic 5%  — xem danh sách    │
│  [ Thử ]       [ Mua ]      │   │  ✏ 500      [ Mở rương ]     │
└─────────────────────────────┘   └─────────────────────────────┘
```

- Tab: **Rương** · **Vật phẩm** (mua lẻ, lọc theo loại) · **Thẻ** (chức năng) · **Tủ đồ**.
- **Thử:** xem skin trên bàn mẫu, chỉ ở client, không lưu — **đã làm** (`/shop`, hộp "Thử" với nút "Vẽ thử").
- **Mở rương:** animation mở (nắp bật, vật phẩm bay lên, "TRÙNG — hoàn 250" nếu trùng); nút "Mở tiếp".
- **Header:** hiện Ruột chì + Hoa điểm tốt, Lv + thanh EXP, lối tắt tới shop (pill người chơi).
- **Shop xoay vòng:** mỗi ngày 6 vật phẩm lẻ ngẫu nhiên (seed ngày) **giảm 20%**.

## Donate

- Trang `/donate` (vi: "Ủng hộ") với lời cảm ơn và các kênh: **VietQR chuyển khoản ngân hàng**, **MoMo**, và một kênh quốc tế (Buy Me a Coffee hoặc Ko-fi) cho người dùng giao diện tiếng Anh.
- Link và mã QR đặt trong `web/src/config/donate.ts`; đổi không cần sửa backend.
- **Donate không đổi lấy bất kỳ thứ gì trong game** — không huy hiệu, không Ruột chì, không skin. Lý do: trao vật phẩm đổi lấy tiền sẽ trở thành bán hàng và kéo theo nghĩa vụ pháp lý ([10](10-phap-ly.md#donate)).
- Có thể có **danh sách cảm ơn** trên trang `/donate`, chỉ với người **tự nguyện đăng ký** tên hiển thị; không nhập liên kết với tài khoản game.
- Trang ghi rõ chi phí vận hành hằng tháng (VPS, tên miền) để minh bạch.
- Lời mời donate xuất hiện **tối đa một lần** ở màn hình kết thúc trận, sau khi người chơi đã chơi ≥ 20 ván, và tắt được. Không bao giờ chen vào giữa trận.

## Phụ lục — Khảo sát hệ thống tiền tệ của noitu.fun (2026-10-20)

Khảo sát trực tiếp trên site (Tạp Hóa, hồ sơ, trang Ủng hộ). Ghi lại để học cấu trúc, không sao chép nội dung.

| Thành phần | Cách noitu làm |
|---|---|
| **Hai loại tiền, đều miễn phí** | **Xu** (vàng) là tiền chính; **Kim cương** (tím) là tiền phụ, nhận khi mở rương ra vật phẩm **trùng**. Không có nạp tiền để mua xu/kim cương |
| **Nguồn xu** | Chủ yếu qua **Thành tựu** nhiều cấp (0/8): thắng xếp hạng liên tiếp, chơi 50 trận xếp hạng, đạt 50 điểm với bot, kết bạn, tặng quà, góp từ vào từ điển (+25 xu)… mỗi cấp +2 đến +25 xu. Ngoài ra: **EXP / cấp độ**, **giftcode**, mini-game "Vườn Chữ" |
| **Tạp Hóa** | Bán bằng xu: Thẻ đổi tên 500, Thẻ upload avatar 1000, bộ sticker chat 200, vật phẩm cho "Vườn Chữ" |
| **Rương** (gacha) | 8 loại rương theo chủ đề, giá 100–800 xu, **liệt kê rõ danh sách vật phẩm có thể nhận** (21–26 món); **trùng → quy đổi kim cương**; một rương **giá tăng mỗi lần mua trong ngày** |
| **Tủ Đồ / Tủ trưng bày** | Kho vật phẩm (kể cả rương chưa mở); 3 ô trưng bày trong hồ sơ |
| **Quà tặng** | Người chơi tặng vật phẩm cho nhau; có thành tựu cho cả hai phía |
| **Ủng hộ** | 20k/30k/50k đ → 3/6/12 tháng **không quảng cáo** + vật phẩm kỷ niệm "Trống Đồng Tri Ân"; VietQR / MoMo / ZaloPay; cần liên kết Google trước; danh sách cảm ơn |

Nhận xét: họ **không bán tiền**; động cơ là thành tựu + sưu tầm; gacha chỉ bằng tiền miễn phí và minh bạch; "giá tăng trong ngày" thay cho trần ngày. Những điểm này đã được chuyển thành [ADR-0007](adr/0007-thanh-tuu-cap-do-ruong.md). Điểm **không** học: quảng cáo, vật phẩm đổi lấy tiền ủng hộ (xem [10](10-phap-ly.md#donate)), mini-game ngoài trọng tâm.

## Thông số chỉnh ở admin (2026-10-22)

Bảng `app_config` (key → JSON), mặc định trong `api/app/admin/config.py`, cache mỗi tiến trình, đọc lại 15 giây; sửa ở `/admin` → Thông số ([13](13-xac-thuc.md#admin-2026-10-22)):

| Khóa | Mặc định | Dùng ở |
|---|---|---|
| `ranked_win_lead` | 30 | thưởng người thắng trận xếp hạng (cả trận với máy) |
| `rarity_price` | trắng 100 · xanh lá 250 · xanh lam 600 · tím 1500 Ruột chì · vàng 5 Hoa | giá shop |
| `checkin_rewards` | 10 10 15 15 20 20 30+1 Hoa | điểm danh 7 ngày |
| `mm_bot_after_seconds` | null (= biến môi trường, 45) | ghép máy khi chờ lâu; 0 = tắt |

