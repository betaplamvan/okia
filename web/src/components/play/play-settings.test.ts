import { describe, expect, it } from "vitest";
import { adaptAfterResult, DEFAULT_SETTINGS } from "./play-settings";

describe("adaptAfterResult", () => {
  it("tăng 0.1 sau 3 ván thắng liên tiếp rồi reset chuỗi", () => {
    let s = DEFAULT_SETTINGS;
    s = adaptAfterResult(s, true);
    s = adaptAfterResult(s, true);
    expect(s.streak).toBe(2);
    s = adaptAfterResult(s, true);
    expect(s.strength).toBeCloseTo(0.75);
    expect(s.streak).toBe(0);
  });

  it("giảm 0.1 sau 3 ván thua liên tiếp, không dưới 0.2", () => {
    let s = { ...DEFAULT_SETTINGS, strength: 0.25 };
    for (let i = 0; i < 3; i++) s = adaptAfterResult(s, false);
    expect(s.strength).toBeCloseTo(0.2);
  });

  it("thắng rồi thua thì chuỗi đổi chiều; hòa thì reset", () => {
    let s = adaptAfterResult(DEFAULT_SETTINGS, true);
    s = adaptAfterResult(s, false);
    expect(s.streak).toBe(-1);
    s = adaptAfterResult(s, null);
    expect(s.streak).toBe(0);
  });
});
