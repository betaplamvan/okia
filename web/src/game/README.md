# `src/game` — engine trò chơi (TypeScript thuần, không phụ thuộc React)

| File / thư mục  | Vai trò                                                                                                                | Việc trong lộ trình           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `rules.ts`      | Luật Dots & Boxes: đánh số cạnh/ô, `createGame`, `applyMove`. Phải khớp `api/app/game/rules.py` qua `shared/fixtures/` | P0-05, P0-06                  |
| `bot.ts`        | Bot thuật toán với tham số `strength`                                                                                  | P0-11 (bot tạm), P0-17, P0-18 |
| `controller.ts` | Interface `GameController` + `LocalBotController`; `NetworkController` ở giai đoạn 1                                   | P0-11, P1-18                  |
| `renderer/`     | PixiJS: bàn, chấm, cạnh, ô, animation (GSAP)                                                                           | P0-07…P0-14                   |
| `audio/`        | `AudioManager` (Howler, audio sprite)                                                                                  | P0-15, P0-16                  |
| `skins/`        | Nạp manifest skin, áp dụng cho renderer                                                                                | P2-16, P2-17                  |

Quy tắc: engine nhận một hàm `t` để dịch chữ hiển thị trên canvas, không import thư viện i18n; React chỉ mount engine trong `useEffect` và không re-render theo frame. Đặc tả: [`docs/03-luat-choi.md`](../../../docs/03-luat-choi.md).
