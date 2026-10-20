import { describe, expect, it } from "vitest";
import { system } from "./index";

describe("theme", () => {
  it("định nghĩa token màu mực cho hai người chơi", () => {
    expect(system.token("colors.ink.500")).toBe("#1e4fd8");
    expect(system.token("colors.redink.500")).toBe("#d8341e");
  });

  it("có font viết tay cho bàn đấu", () => {
    expect(system.token("fonts.hand")).toContain("--font-hand");
  });
});
