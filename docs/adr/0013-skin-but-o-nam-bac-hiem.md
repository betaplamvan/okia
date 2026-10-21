# ADR-0013 — Hai loại skin (bút, ô đã ăn), năm bậc hiếm theo màu, catalog bằng file

- **Ngày:** 2026-10-21
- **Trạng thái:** chấp nhận (thu hẹp và cụ thể hóa [docs/08](../08-skin.md); bổ sung [ADR-0007](0007-thanh-tuu-cap-do-ruong.md))

## Bối cảnh

docs/08 bản đầu vẽ bốn loại skin (bút, nét, ô, bàn) với asset raster/atlas và bảng `items` seed từ manifest. Dự án solo chưa có họa sĩ, asset ngoài tốn công; người chơi cần thứ nhìn thấy ngay trong trận và hiểu ngay độ hiếm. Người phát triển yêu cầu: shop, skin bút gồm nét vẽ + tiếng ăn ô + hiệu ứng combo, skin ô đã ăn, phân bậc **trắng / xanh lá / xanh lam / tím / vàng**.

## Quyết định

1. **Hai loại skin:** `pen` (nét vẽ, bộ tiếng `capture`/`combo`, kiểu chữ COMBO, loại vụn, mốc rung) và `box` (hình tô vào ô đã ăn + loại vụn). Loại `stroke` gộp vào `pen`; loại `board` để sau. Mỗi người trang bị một skin mỗi loại; trong trận **mỗi bên thấy bút/ô của chính người vẽ** (gửi trong `room_state.loadouts`).
2. **Năm bậc hiếm theo màu** (`rarity`): `common` trắng · `uncommon` xanh lá · `rare` xanh lam · `epic` tím · `legendary` vàng. **Giá theo bậc, cố định trong code** (không ghi trong manifest): 100 · 250 · 600 · 1500 Ruột chì; bậc vàng mua bằng **5 Hoa điểm tốt** (lý do tồn tại của Hoa — ADR-0010). Skin `default` mỗi loại miễn phí, ai cũng có.
3. **100 % thủ tục:** skin chỉ là tham số (manifest JSON) cho hiệu ứng có sẵn trong engine PixiJS; tiếng tổng hợp bằng `scripts/synth-sfx.mjs` vào audio sprite chung. Không có atlas/asset raster, không CDN. Thêm skin mới = thêm một file JSON (+ tiếng nếu cần).
4. **Catalog bằng file, không có bảng `items`:** nguồn `shared/skins/<type>/<id>.json` → `pnpm gen:skins` sinh `api/app/skins/catalog.json` và `web/src/game/skins/catalog.data.ts` (như bể map). DB chỉ giữ `inventory` (sở hữu) và `loadouts` (trang bị); `item_id` kiểm tra theo catalog trong code. Test hai bên báo đỏ nếu bản sinh lệch nguồn.
5. Mua lẻ: `debit` ví + thêm `inventory` trong một transaction, idempotency `buy:{user}:{skin}`; mua lại → `ALREADY_OWNED`. Khách xem và **thử** được (bàn mẫu ở client), mua/trang bị cần tài khoản Google.

## Hệ quả

- (+) Có shop chạy được ngay với 19 skin, không chờ asset; Hoa điểm tốt có chỗ tiêu.
- (+) Bỏ bảng `items`/seed/upload R2 → ít việc vận hành; đổi giá chỉ sửa một bảng trong code.
- (−) Không còn skin `stroke`/`board` tách riêng; rương/bộ sưu tập (ADR-0007) vẫn chưa làm — khi làm, rương sẽ phát skin từ cùng catalog này.
- (−) Skin cầu kỳ (texture, sprite) cần mở rộng engine; chấp nhận cho tới khi có họa sĩ.

## Bổ sung 2026-10-21: hai hình thái

Bản đầu giữ màu ghế (xanh/đỏ) làm màu nét, skin chỉ đổi *cách* vẽ — bút trông nghèo và hai người cùng bút vẫn phải nhờ màu ghế. Quyết định: **mỗi bút có hai hình thái màu** trong manifest (`forms.mine` tông lạnh, `forms.opponent` tông nóng) và một **kiểu nét** `pen.style` (`flat`, `twotone`, `gradient`, `neon`, `brush`, `fire`, `rainbow`, `metal`). Engine chọn hình thái theo *phía nhìn* (ghế = `session.human` → `mine`), nên hai bên đều thấy nét mình lạnh, nét đối thủ nóng; màu ô đã ăn, chữ COMBO, vụn lấy từ hình thái bút của người ăn (skin ô chỉ giữ hình tô). Hiệu ứng chạy liên tục (quầng neon thở, lửa, cầu vồng trôi, ánh kim) đi qua ticker của renderer, tĩnh hoàn toàn khi giảm hiệu ứng, có trần hạt và vẽ lại tối đa mỗi ~50 ms. Thêm bút vàng thứ ba **Bút lửa** (tiếng `capture_fire`/`combo_fire` tổng hợp); Phấn trắng đổi tên thành **Phấn màu** (id giữ nguyên). `gen:skins` bắt buộc hai hình thái có màu chính hex khác nhau. Catalog: 20 skin.
