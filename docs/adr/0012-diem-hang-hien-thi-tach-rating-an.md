# ADR-0012 — Điểm hạng hiển thị tách khỏi rating ẩn; ghép lệch khi vắng người nhưng giảm điểm cược

- **Ngày:** 2026-10-21
- **Trạng thái:** chấp nhận (bổ sung [docs/07](../07-xep-hang-ghep-tran.md); thay phần "hạng = mmr − 2·rd" của bản 07 cũ)

## Bối cảnh

Game có ít người chơi, nhất là lúc mới ra. Nếu chỉ ghép người cùng trình độ thì chờ mãi không có trận; nếu ghép bừa thì người mạnh "cày" người yếu để leo hạng, người yếu nản. Bản 07 cũ hiện hạng từ `mmr − 2·rd` — con số Glicko-2 khó hiểu với người chơi (thắng mà điểm hiện có thể giảm vì rd co lại), và không có cách "chỉnh" riêng cho trận lệch.

## Quyết định

1. **Hai con số tách biệt**
   - **Rating ẩn** (Glicko-2 `mmr/rd/vol`): chỉ server dùng để ghép trận và tính kỳ vọng thắng `E`. Không gửi cho client.
   - **Điểm hạng hiển thị** (`points`, ≥ 0): người chơi nhìn thấy, leo hạng/bậc theo ngưỡng cố định (300 điểm/hạng, 3 bậc). Cộng/trừ theo quy tắc dễ hiểu: trận cân +24/−16.
2. **Ghép lệch khi vắng người, nhưng giảm điểm cược.** Cửa sổ rating nới dần theo thời gian chờ, sau 90 giây ghép bất kỳ ai. Điểm cộng/trừ nhân với **tiền cược** `s` giảm tuyến tính theo chênh lệch rating ẩn (1 khi chênh ≤ 150 → 0.1 khi chênh ≥ 500), tối thiểu ±1. Trận lệch nhiều: người mạnh thắng +1, người yếu thua −1.
3. **Điểm hạng không bao giờ âm**; 5 trận đầu mùa là phân hạng (chưa hiện hạng, chưa lên BXH).
4. Rating lưu **một dòng mỗi người mỗi mùa** (không tách theo bàn như bản 05 cũ) vì xếp hạng luôn bốc map ngẫu nhiên.
5. Mùa tự mở khi mùa trước hết (8 tuần); reset mềm cả rating ẩn lẫn điểm (÷ 2).

## Hệ quả

- (+) Luôn có trận khi có ≥ 2 người online; mất mát của trận lệch rất nhỏ nên không ai sợ bị ghép với người giỏi hơn, và không cày được người yếu.
- (+) Người chơi hiểu "thắng là lên điểm"; rating ẩn vẫn hội tụ đúng nhờ Glicko-2.
- (−) Hai hệ số có thể "lệch" nhau (điểm cao nhưng rating ẩn thấp hoặc ngược lại) — chấp nhận, vì BXH là trò chơi cho người chơi, còn ghép trận cần độ chính xác.
- (−) Thêm một bảng và một worker nền; chốt trận phải trong một transaction (đã làm).
- Thưởng cuối mùa và phát hiện dàn xếp kết quả vẫn là việc sau (P3-03, P2-13).
