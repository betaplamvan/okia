import { describe, expect, it } from "vitest";
import {
  adaptAfterResult,
  DEFAULT_SETTINGS,
  MIN_STRENGTH,
  sanitize,
  START_STRENGTH,
} from "./play-settings";

describe("adaptAfterResult", () => {
  it("người mới bắt đầu ở mức dễ", () => {
    expect(DEFAULT_SETTINGS.strength).toBe(START_STRENGTH);
    expect(START_STRENGTH).toBeLessThan(0.5);
  });

  it("tăng 0.1 sau 3 ván thắng liên tiếp rồi reset chuỗi", () => {
    let s = DEFAULT_SETTINGS;
    s = adaptAfterResult(s, true);
    s = adaptAfterResult(s, true);
    expect(s.streak).toBe(2);
    s = adaptAfterResult(s, true);
    expect(s.strength).toBeCloseTo(START_STRENGTH + 0.1);
    expect(s.streak).toBe(0);
  });

  it("giảm 0.1 sau 2 ván thua liên tiếp (xuống nhanh hơn lên), không dưới sàn", () => {
    let s = { ...DEFAULT_SETTINGS, strength: 0.45 };
    s = adaptAfterResult(s, false);
    expect(s.strength).toBeCloseTo(0.45);
    s = adaptAfterResult(s, false);
    expect(s.strength).toBeCloseTo(0.35);
    expect(s.streak).toBe(0);
    s = { ...DEFAULT_SETTINGS, strength: MIN_STRENGTH + 0.05 };
    for (let i = 0; i < 6; i++) s = adaptAfterResult(s, false);
    expect(s.strength).toBeCloseTo(MIN_STRENGTH);
  });

  it("thắng rồi thua thì chuỗi đổi chiều; hòa thì reset", () => {
    let s = adaptAfterResult(DEFAULT_SETTINGS, true);
    s = adaptAfterResult(s, false);
    expect(s.streak).toBe(-1);
    s = adaptAfterResult(s, null);
    expect(s.streak).toBe(0);
  });
});

describe("chuyển cài đặt cũ (2026-10-26)", () => {
  it("còn đúng mặc định cũ 0.8 (chưa từng tự điều chỉnh) → mức khởi điểm mới", () => {
    expect(sanitize({ mapId: "5x5", strength: 0.8, streak: 0 }).strength).toBe(START_STRENGTH);
  });

  it("đã tự điều chỉnh (khác 0.8) hoặc đã ở bản mới → giữ nguyên", () => {
    expect(sanitize({ mapId: "5x5", strength: 0.6, streak: 1 }).strength).toBe(0.6);
    expect(sanitize({ mapId: "5x5", strength: 0.8, streak: 0, v: 2 }).strength).toBe(0.8);
  });

  it("kẹp trong [sàn, 1]", () => {
    expect(sanitize({ strength: 0.01 }).strength).toBe(MIN_STRENGTH);
    expect(sanitize({ strength: 3 }).strength).toBe(1);
  });
});
