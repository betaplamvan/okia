/**
 * Tiếng bấm chung cho mọi nút trong game (docs/08 — Âm thanh): một listener `click` ở giai đoạn
 * capture trên document, bắt mọi phần tử tương tác (nút, link, tab, công tắc, ô chọn…) và phát
 * `ui_click`. Không phải gắn tay từng nút; muốn tiếng khác thì đặt `data-sfx` trên phần tử (hoặc tổ
 * tiên): `confirm` (hành động chính), `back` (hủy/thoát), `open`, `close`, `none` (im lặng — ví dụ
 * bàn cờ tự phát tiếng bút).
 *
 * Nút bị vô hiệu không kêu. Hai click cách nhau < 40 ms (label → input tổng hợp) chỉ kêu một lần.
 */
import { audio } from "./audio-manager";

export type UiSfx = "click" | "confirm" | "back" | "open" | "close";
const KINDS: readonly string[] = ["click", "confirm", "back", "open", "close"];

const INTERACTIVE = [
  "button",
  "a[href]",
  "summary",
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="submit"]',
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="link"]',
].join(",");

const DISABLED = '[disabled], [aria-disabled="true"], [data-disabled]';
const MIN_GAP_MS = 40;

/** Xác định tiếng cho một click; `null` = không kêu. Tách riêng để test. */
export function sfxFor(target: Element | null): UiSfx | null {
  const el = target?.closest(INTERACTIVE);
  if (!el) return null;
  if (el.matches(DISABLED) || el.closest(DISABLED)) return null;
  const tagged = el.closest("[data-sfx]");
  const kind = tagged?.getAttribute("data-sfx") ?? "click";
  if (kind === "none") return null;
  return (KINDS.includes(kind) ? kind : "click") as UiSfx;
}

/** Gắn listener toàn cục; trả hàm gỡ. */
export function attachUiSounds(doc: Document = document): () => void {
  let last = 0;
  const onClick = (e: MouseEvent) => {
    const kind = sfxFor(e.target instanceof Element ? e.target : null);
    if (!kind) return;
    const now = e.timeStamp || performance.now();
    if (now - last < MIN_GAP_MS) return;
    last = now;
    audio.playUi(kind);
  };
  doc.addEventListener("click", onClick, true);
  return () => doc.removeEventListener("click", onClick, true);
}
