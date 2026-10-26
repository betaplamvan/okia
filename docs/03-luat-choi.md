# 03 — Đặc tả luật chơi

Tài liệu này là nguồn chuẩn cho cả `rules.ts` và `rules.py`. Hai bản phải cho kết quả giống hệt nhau trên mọi fixture.

## Mô hình bàn

Bàn có `R` hàng × `C` cột **ô**, tức `(R+1) × (C+1)` chấm.

- Số cạnh ngang: `H = (R+1) × C`
- Số cạnh dọc: `V = R × (C+1)`
- Tổng số cạnh: `E = H + V = 2RC + R + C` (bàn 5×5 có 60 cạnh)

### Đánh số cạnh

Mỗi cạnh có một `edge id` nguyên trong `[0, E)`.

| Loại | Vị trí | Công thức id | Phạm vi |
|---|---|---|---|
| Ngang | hàng chấm `r ∈ [0, R]`, cột `c ∈ [0, C)` — nối chấm `(r,c)`–`(r,c+1)` | `r × C + c` | `[0, H)` |
| Dọc | hàng `r ∈ [0, R)`, cột chấm `c ∈ [0, C]` — nối chấm `(r,c)`–`(r+1,c)` | `H + r × (C+1) + c` | `[H, E)` |

### Đánh số ô

Ô `(r, c)` với `r ∈ [0, R)`, `c ∈ [0, C)` có id `r × C + c`. Bốn cạnh của ô:

```
top    = r × C + c
bottom = (r+1) × C + c
left   = H + r × (C+1) + c
right  = H + r × (C+1) + c + 1
```

Một cạnh thuộc tối đa **2 ô**.

### Ví dụ bàn 2×2 (H = 6, V = 6, E = 12)

```
 •──0──•──1──•
 │     │     │
 6  ô0 7  ô1 8
 │     │     │
 •──2──•──3──•
 │     │     │
 9  ô2 10 ô3 11
 │     │     │
 •──4──•──5──•
```

## Map: lưới + mặt nạ ô

Quyết định: [ADR-0009](adr/0009-be-map-hinh-thu.md). Mỗi bàn là lưới `R × C` (khung bao khít) kèm **mặt nạ ô**: ô nào thuộc bàn. Bàn chữ nhật là mặt nạ đầy. Cách đánh số cạnh/ô ở trên **giữ nguyên**.

- Ô ngoài mặt nạ: `owners = VOID (-2)` — không bao giờ có chủ.
- Cạnh không kề ô nào thuộc bàn: `edges = VOID (-2)` — không vẽ được. Cạnh kề ít nhất một ô thuộc bàn (kể cả mép hình, viền "lỗ") vẽ được bình thường.
- Một "lỗ" (ô ngoài mặt nạ nằm giữa hình) có thể đủ 4 cạnh vẽ được nhưng vẫn **không bị ăn**.
- Ván kết thúc khi mọi cạnh **vẽ được** đã vẽ (`moveNo` = số cạnh khác VOID).

Bể map: `shared/maps/maps.json` (`'#'` thuộc bàn, `'.'` trống) — sửa xong chạy `node web/scripts/gen-maps.mjs` để sinh bản cho web (`maps.data.ts`) và api (`app/game/maps.json`). Ràng buộc thiết kế (test kiểm tra): **số ô lẻ** (không thể hòa), các ô **liền nhau theo cạnh**, khung bao khít, có tên vi/en. Map `3x3` là map ẩn chỉ dùng cho test (server production từ chối).

| Chế độ | Chọn map |
|---|---|
| Chơi với máy, phòng riêng | Người chơi chọn một map hoặc "Ngẫu nhiên" |
| Xếp hạng | Luôn ngẫu nhiên (server bốc) |

**Đánh dấu nước vừa đi** (chơi với máy, phòng riêng): tùy chọn tô quầng các cạnh đối thủ vẽ trong lượt gần nhất (cả chuỗi ăn liên tiếp). Phòng riêng: luật của phòng do chủ phòng chọn (`showLastMove`), áp dụng cho cả hai; chơi với máy: cài đặt cá nhân. Mặc định bật.

## Trạng thái ván

```
rows, cols
edges:   E phần tử, mỗi phần tử là -1 (chưa vẽ), chỉ số người vẽ (0|1) hoặc VOID (-2, không thuộc bàn)
owners:  R×C phần tử, -1 (chưa ai), 0|1 hoặc VOID (-2, ô ngoài mặt nạ)
scores:  [s0, s1]
turn:    0|1  — người đang có lượt
moveNo:  số nước đã đi
finished: bool
```

Người đi trước là `0`. **Lượt đi đầu ngẫu nhiên ở mọi chế độ** (2026-10-26): online (phòng riêng, xếp hạng, xếp hạng với máy) server bốc ngẫu nhiên ai ngồi ghế `0`; chơi với máy client bốc mỗi ván (`LocalBotController`, `humanFirst: "random"`). Đầu ván hiện màn **"Bạn đi trước!" / "{tên} đi trước"** ~1,8 giây (`FirstTurnBanner`, nền xanh khi mình đi trước, đỏ khi đối thủ); lượt đầu được cộng thêm 2,5 giây (`room.OPENING_EXTRA_MS`) và máy chờ thêm ~2 giây trước nước đầu để người chơi kịp đọc.

**Mình luôn bên trái, màu Xanh; đối thủ luôn bên phải, màu Đỏ** — trên màn hình của mỗi người, bất kể ngồi ghế nào: `GameLayout` đặt chip mình bên trái; nét / ô / chữ đếm trên bàn dùng hình thái `mine` (tông lạnh) của bút cho mình và `opponent` (tông nóng) cho đối thủ; chip và đồng hồ lượt cũng tô theo mình/đối thủ (trước 2026-10-26 chip tô theo ghế nên ai ngồi ghế 1 thấy chip mình màu đỏ).

## Luật một nước đi

`applyMove(state, player, edge)`:

1. **Hợp lệ khi:** `!finished`, `player == turn`, `0 ≤ edge < E`, `edges[edge] == -1`. Cạnh VOID → `INVALID_EDGE`. Ngược lại trả lỗi (`GAME_OVER`, `NOT_YOUR_TURN`, `INVALID_EDGE`, `EDGE_TAKEN`) và **không đổi** trạng thái.
2. Gán `edges[edge] = player`, `moveNo += 1`.
3. Với mỗi ô **thuộc bàn** kề cạnh vừa vẽ (1 hoặc 2 ô): nếu đủ 4 cạnh và `owners == -1` → `owners = player`, cộng 1 điểm. Danh sách ô vừa ăn sắp **tăng dần theo id ô**.
4. Nếu ăn được ≥ 1 ô → `turn` giữ nguyên (đi tiếp). Nếu không → `turn = 1 - turn`.
5. Nếu mọi cạnh vẽ được đã vẽ → `finished = true`.

Kết quả trả về: `{ state, captured: number[] }`.

## Kết thúc & thắng thua

- Thắng: điểm cao hơn. Hòa khi bằng điểm (chỉ xảy ra với bàn có số ô chẵn, ví dụ 4×4).
- Mọi map trong bể có số ô lẻ nên **không thể hòa** khi chơi hết ván.
- **Đầu hàng:** người đầu hàng thua ngay, không phụ thuộc điểm.

## Timer & bỏ lượt (chỉ chế độ online)

| Chế độ | Thời gian mỗi lượt |
|---|---|
| Xếp hạng, ghép trận thường | 20 giây |
| Phòng riêng | Chủ phòng chọn: 15 / 30 / 60 giây / không giới hạn |

- Mỗi lần được đi tiếp (sau khi ăn ô), đồng hồ **đặt lại**.
- Hết giờ: server tự vẽ một cạnh **ngẫu nhiên trong số cạnh hợp lệ** cho người đó (`reason: "timeout"`).
- **3 lần hết giờ liên tiếp** → xử thua (`reason: "afk"`).
- Mất kết nối (2026-10-24, [04](04-giao-thuc-ws.md#kết-nối-lại-viết-lại-2026-10-24)): tới lượt mà đang rớt thì đồng hồ **dừng**, có 60 giây (thông số admin) để nối lại; nối lại được thì lượt mới trọn vẹn; không → thua `reason: "abandon"`.

## Fixtures dùng chung

Đặt trong `shared/fixtures/*.json`. Mỗi file một kịch bản:

```json
{
  "name": "2x2: ăn một ô rồi đi tiếp",
  "rows": 2,
  "cols": 2,
  "moves": [
    { "player": 0, "edge": 0 },
    { "player": 1, "edge": 2 },
    { "player": 0, "edge": 6 },
    { "player": 1, "edge": 7, "expectCaptured": [0] },
    { "player": 1, "edge": 1 }
  ],
  "expect": {
    "scores": [0, 1],
    "turn": 0,
    "finished": false,
    "owners": [1, -1, -1, -1]
  }
}
```

- `cells` (tùy chọn): mặt nạ ô dạng chuỗi như `shared/maps` — fixture cho map hình thù.
- `expectCaptured` (tùy chọn): danh sách ô phải ăn được ở nước đó.
- `expectError` (tùy chọn): mã lỗi nước đó phải trả về; trạng thái không đổi.
- Nhóm fixture tối thiểu cần có:
  - nước hợp lệ cơ bản, đổi lượt
  - ăn 1 ô → đi tiếp
  - một cạnh ăn **2 ô cùng lúc**
  - chuỗi ăn liên tiếp nhiều ô
  - mọi loại lỗi (`NOT_YOUR_TURN`, `INVALID_EDGE`, `EDGE_TAKEN`, `GAME_OVER`)
  - chơi hết một ván 2×2 và 3×3
  - ván hòa 2×2
  - mặt nạ: cạnh VOID → `INVALID_EDGE`, ăn ô sát mép, kết thúc khi hết cạnh vẽ được, lỗ không bị ăn; một ván ngẫu nhiên trọn vẹn trên map hình thù

## Bot

Quyết định: [ADR-0003](adr/0003-bot-thuat-toan-va-llm.md). **Một bot duy nhất**, không cho người chơi chọn mức. **Thuật toán quyết định nước đi**; LLM chỉ tạo lời thoại (xem [Cá tính bot](#cá-tính-bot-llm)).

### Thuật toán

Bot luôn chạy đầy đủ chiến thuật, rồi một tham số `strength ∈ [0, 1]` quyết định tần suất "cố tình mắc lỗi":

1. Có ô ăn được → ăn (trừ khi double-cross có lợi hơn, xem bước 4).
2. Còn cạnh "an toàn" (không phải cạnh thứ 3 của ô nào) → chọn một cạnh an toàn.
3. Hết cạnh an toàn → nhường chuỗi/vòng **ngắn nhất**.
4. **Nhường đôi** (double-dealing, 2026-10-22): khi ăn chuỗi mà đã hết cạnh an toàn, bỏ lại 2 ô cuối chuỗi (4 ô cuối vòng) để đối thủ phải mở chuỗi tiếp — nếu tìm kiếm cho thấy có lợi.
5. **Tìm kiếm** (negamax + alpha-beta + bảng ghi nhớ, ngân sách 60 000 nút ≈ dưới 150 ms): ở tàn cuộc (hết cạnh an toàn) và ở pha cuối an toàn (≤ 10 cạnh an toàn, sâu 3 cạnh an toàn, phần tàn cuộc giải hết). Tập nước được cắt tỉa theo lý thuyết: đang ăn được thì chỉ xét "ăn" và "nhường đôi"; phải nhường thì gom các cạnh mở cùng một chuỗi. Quá ngân sách → quay về luật 1–3. Nhờ vậy bot chọn **chuỗi nào** để nhường theo kết quả thật (không chỉ chuỗi ngắn nhất) và nắm luật chuỗi dài ở cuối pha an toàn.

**Lỗi có chủ đích** (mô hình 2026-10-22): với xác suất `1 − strength` ở mỗi quyết định, bot **bỏ lớp tìm kiếm / nhường đôi** (bước 4–5) và chơi như bot cũ — ăn tham lam, cạnh an toàn ngẫu nhiên, nhường chuỗi ngắn nhất; vẫn là nước "biết chơi". Nước **ngớ ngẩn** (quên ăn ô, vẽ cạnh thứ ba khi còn cạnh an toàn) chỉ xuất hiện khi `strength < 0.6`, xác suất `(0.6 − strength) / 2` mỗi quyết định (sàn 0.4 → 10 %). Mô hình cũ (lỗi = nước ngẫu nhiên bất kỳ) là lý do "máy quá dễ": ở 0.8 nó thua chính bot tham lam 19/20.

Đo 2026-10-22, 20 ván mỗi ô, đối thủ là bot tham lam (chỉ luật 1–3), đổi bên mỗi ván:

| strength | 5×5 | 7×7 | Khủng long |
|---|---|---|---|
| 1.0 | thắng 20 | 20 | 20 |
| 0.8 (mặc định) | 18 | 17 | 14 |
| 0.6 | 15 | 14 | 12 |
| 0.4 | 4 | 3 | 2 |
| 0.35 (khởi điểm người mới, 2026-10-26) | 2 | — | — |
| 0.2 | 0 | — | — |
| 0.1 (sàn) | 0 | — | — |

Đo lại 5×5 ngày 2026-10-26 (`BENCH=1 pnpm exec vitest run src/game/bot-strength.bench.test.ts`): 1.0 → 19, 0.8 → 18, 0.6 → 13, 0.4 → 3, 0.35 → 2, 0.2 → 0, 0.1 → 0. Bot tham lam đã là mức "biết không vẽ cạnh thứ ba"; người mới thường yếu hơn mức đó nên khởi điểm 0.35 và tự giảm khi thua.

Thời gian một nước (Node, máy dev): trung bình 9–29 ms, tối đa ≈ 160 ms (ngân sách 20 000 nút hoặc 150 ms, quá thì quay về luật 1–3).

### Tự điều chỉnh độ mạnh

Thang mới 2026-10-26 (người mới thua máy liên tục ở 0.8 — mức 0.4 đã yếu hơn cả bot tham lam, còn người mới thì yếu hơn bot tham lam nhiều):

- **Chơi với máy**: người mới bắt đầu ở `strength = 0.35` (`START_STRENGTH`), sàn **0.1** (nước ngớ ngẩn ~25 % mỗi quyết định). Cài đặt cũ còn đúng mặc định 0.8 (chưa từng tự điều chỉnh) được chuyển về 0.35.
- Tự điều chỉnh: **thua 2 ván liên tiếp → −0.1**, thắng 3 ván liên tiếp → +0.1 (xuống nhanh hơn lên), kẹp trong [0.1, 1].
- **Máy trong xếp hạng** (ghép khi chờ lâu, `bot.strength_for_rating`): nội suy theo MMR ẩn — ≤ 1100 → 0.15 · 1500 → 0.35 · 1700 → 0.65 · ≥ 1900 → 0.95; rating chưa chắc (rd ≥ 200) kéo về 0.3, người mới hoàn toàn (1500 / rd 350) gặp máy **0.3** (trước là 0.65).
- `strength` **không hiển thị** cho người chơi. *Các con số là giá trị khởi điểm.*

### Bot chạy ở đâu

| Nơi | Dùng khi | Có thưởng? |
|---|---|---|
| Client — `bot.ts` | Giai đoạn 0 (chưa có backend); dự phòng khi mất mạng | Không |
| Server — `bot.py` | **Đã có (2026-10-22):** ghép máy khi chờ xếp hạng quá lâu ([07](07-xep-hang-ghep-tran.md#ghép-máy-khi-chờ-lâu-2026-10-22)); cùng thuật toán và fixtures với `bot.ts`, ngân sách nhỏ hơn (4 000 nút / 120 ms vì Python chậm hơn). *Chưa:* "Chơi với máy" qua phòng server có thưởng (P2-06) | Có (server xác nhận kết quả) |

Chỉ ván bot chạy ở server mới được thưởng, vì kết quả ở client không đáng tin. Hai bản bot dùng chung **fixtures tình huống** (ví dụ "phải ăn ô", "không được vẽ cạnh thứ 3 khi còn cạnh an toàn") với `strength = 1`.

Bot luôn được **ghi rõ là máy**.

### Cá tính bot (LLM)

Từ giai đoạn 3, bot dùng server LLM (Qwen) để tạo lời thoại:

| Lúc nào | Ví dụ |
|---|---|
| Vào trận | "Hôm nay mình mang bút mới, cẩn thận nhé!" |
| Bot ăn combo ≥ 3 | "Ô kìa! Một… hai… ba ô! Cảm ơn bạn nha 😄" |
| Người chơi ăn combo ≥ 3 | "Ơ khoan, mình chưa chuẩn bị!" |
| Kết thúc | Câu chúc mừng / an ủi |
| Sau ván (tùy chọn) | **Nhận xét ván đấu**: thuật toán tìm nước sai lớn nhất của người chơi (nước làm mất nhiều ô nhất theo tìm kiếm), LLM diễn giải bằng tiếng Việt dễ hiểu |

Quy tắc:
- LLM **không bao giờ** quyết định nước đi và không được chặn luồng trận.
- Gọi bất đồng bộ, timeout 3 giây; quá giờ hoặc lỗi → dùng **câu soạn sẵn** theo sự kiện.
- Lời thoại theo **ngôn ngữ của người chơi** (`vi`/`en`): prompt yêu cầu trả lời bằng ngôn ngữ đó; câu soạn sẵn có đủ hai ngôn ngữ.
- Prompt chỉ chứa dữ liệu trận (điểm, sự kiện, nước đi); **không gửi** tên thật hay dữ liệu cá nhân người chơi.
- Câu trả lời giới hạn ≤ 80 ký tự (lời thoại) / ≤ 400 ký tự (nhận xét), qua bộ lọc từ ngữ trước khi gửi cho client.
- Mỗi trận tối đa ~6 câu thoại để không làm phiền; người chơi tắt được trong cài đặt.
