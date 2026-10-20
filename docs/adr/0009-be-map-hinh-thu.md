# ADR-0009 — Bể map: bỏ 3×3, thêm map hình thù; đánh dấu nước đối thủ vừa đi

- **Ngày:** 2026-10-21
- **Trạng thái:** Chấp nhận

## Bối cảnh

Bàn chỉ có 3×3 / 5×5 / 7×7. Bàn 3×3 quá ngắn để có chiến thuật; người phát triển muốn thêm các bàn
"hình thù kỳ quái" (khủng long, bông hoa…) cho vui và đa dạng, và một tùy chọn ẩn/hiện nước đối thủ vừa
đi để tăng/giảm độ khó khi chơi với máy hoặc với bạn.

## Quyết định

- **Mô hình:** map = lưới R×C (khung bao khít) + **mặt nạ ô**. Ô ngoài mặt nạ và cạnh không kề ô nào
  thuộc bàn mang giá trị `VOID (-2)` ngay trong `edges` / `owners`. Cách đánh số cạnh/ô giữ nguyên; trạng
  thái ván tự mô tả hình nên giao thức WS, Redis và bảng `matches` gần như không đổi. Chi tiết luật:
  [03 — Map](../03-luat-choi.md#map-lưới--mặt-nạ-ô).
- **Bể map:** 5×5, 7×7 và 5 map hình thù (khủng long, bông hoa, bạch tuộc, xương rồng, con ma — 41–45 ô,
  104–118 cạnh, tương đương 7×7). Mọi map có **số ô lẻ** để không thể hòa. 3×3 bỏ khỏi bể, chỉ còn là map
  ẩn cho test.
- **Nguồn chung** `shared/maps/maps.json`; script sinh bản cho web và api (image api không thấy `shared/`);
  test hai bên báo đỏ nếu lệch.
- **Chọn map:** chơi với máy và phòng riêng — chọn map hoặc "Ngẫu nhiên"; xếp hạng — luôn ngẫu nhiên.
- **Đánh dấu nước vừa đi:** quầng vàng dưới các cạnh đối thủ vẽ trong lượt gần nhất. Phòng riêng: luật
  phòng (`showLastMove`) do chủ phòng chọn; chơi với máy: cài đặt cá nhân. Mặc định bật.

## Phương án đã loại

- **Danh sách cạnh/ô tường minh cho từng map (đồ thị tổng quát):** linh hoạt hơn (lục giác…) nhưng phải
  viết lại đánh số, renderer và giao thức; lưới + mặt nạ đủ cho mọi hình ghép từ ô vuông.
- **Gửi mặt nạ riêng trong `room_state`:** thừa, vì VOID trong `edges`/`owners` đã mang đủ thông tin.
- **Đánh dấu nước vừa đi là cài đặt hiển thị của từng người (cả phòng riêng):** loại vì người phát triển
  muốn đây là một thể thức chơi — hai người cùng luật.

## Hệ quả

- ➕ Ván đa dạng; bàn vuông là trường hợp đặc biệt nên code cũ và dữ liệu cũ (`matches.board = "3x3"`)
  vẫn hợp lệ. `matches.board` nới lên 32 ký tự cho id map.
- ➖ Map hẹp sinh nhiều chuỗi dài — bot hiện tại vẫn đúng luật nhưng yếu hơn ở đó (xem P0-18).
- ➖ **Giai đoạn 2A:** xếp hạng bốc map ngẫu nhiên nên điểm xếp hạng (`ratings`, hiện có khóa `board` trong
  [05](../05-co-so-du-lieu.md)) và hàng chờ (`mm:{mode}:{board}`) không nên chia theo bàn — xem lại khi làm
  M2.x.
