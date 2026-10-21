# Ghi công asset (docs/12 — mọi asset ngoài phải có giấy phép rõ)

## Âm thanh

| Tên trong game | Nguồn / tác giả | Giấy phép | File gốc |
|---|---|---|---|
| `ui_click`, `ui_confirm`, `ui_back`, `ui_error`, `ui_open`, `ui_close`, `ui_drop`, `ui_select`, `notify`, `glass` | **Kenney** — [Interface Sounds](https://kenney.nl/assets/interface-sounds) (kenney.nl) | CC0 1.0 | `shared/audio/ui/*.ogg` |
| `draw_01..03` (bút chì), `capture` (ting ăn ô), `combo` (lấp lánh ăn chuỗi), `count` (pop đếm ô), `turn`, `win`, `lose` | Tổng hợp bằng `web/scripts/synth-sfx.mjs` (dự án tự tạo) | Thuộc dự án | `shared/audio/core/*.wav` |
| Nhạc nền `childhood-friends` | **Juhani Junkala** (SubspaceAudio) — "Calm2 - Childhood Friends", [JRPG Pack 4 Calm](https://opengameart.org/content/jrpg-pack-4-calm) trên OpenGameArt | CC0 1.0 | `shared/audio/music/childhood-friends.ogg` |
| Nhạc nền `calm-loop` | **wipics** — [Calm Loop](https://opengameart.org/content/calm-loop) trên OpenGameArt | CC0 1.0 | `shared/audio/music/calm-loop.mp3` |

Các gói Kenney khác đã tải để chọn (UI Audio, Music Jingles, Impact Sounds — đều CC0) chưa dùng trong game; nếu dùng, thêm dòng vào bảng này.

## Font

| Font | Nguồn | Giấy phép |
|---|---|---|
| Patrick Hand | Google Fonts (Patrick Wagesreiter) | OFL 1.1 |
| Be Vietnam Pro | Google Fonts (Lâm Bảo) | OFL 1.1 |
| Baloo 2 (chỉ dùng để vẽ chữ trong logo, đã chuyển thành path — không tải lúc chạy) | Google Fonts (Ek Type) | OFL 1.1 |

## Hình ảnh

Logo, favicon, icon PWA và ảnh OG là của dự án, sinh bởi `web/scripts/build-brand.mjs` (xem [14](14-thiet-ke-giao-dien.md#nhận-diện-logo-favicon)). Ngoài ra mọi hình trong game vẽ bằng code (PixiJS) hoặc icon [Lucide](https://lucide.dev) (ISC) qua `react-icons`.
