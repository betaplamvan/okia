import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import vi from "../../messages/vi.json";

// Hai file dịch phải có cùng tập key (docs/11). Thiếu key ở một bên → test đỏ.
function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([key, value]) =>
    flattenKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("messages", () => {
  const viKeys = flattenKeys(vi).sort();
  const enKeys = flattenKeys(en).sort();

  it("vi và en có cùng tập key", () => {
    expect(enKeys).toEqual(viKeys);
  });

  it("không có chuỗi rỗng", () => {
    const empty = (obj: unknown, prefix = ""): string[] =>
      typeof obj === "string"
        ? obj.trim() === ""
          ? [prefix]
          : []
        : Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
            empty(v, prefix ? `${prefix}.${k}` : k),
          );
    expect(empty(vi)).toEqual([]);
    expect(empty(en)).toEqual([]);
  });
});
