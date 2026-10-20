import { describe, expect, it } from "vitest";
import { system } from "./index";

describe("theme (docs/14)", () => {
  it("định nghĩa token màu cốt lõi của phong cách sticker", () => {
    expect(system.token("colors.ink")).toBe("#1a2826");
    expect(system.token("colors.paper")).toBe("#fffcf2");
    expect(system.token("colors.mint")).toBe("#7cf5c5");
  });

  it("có màu bút cho hai người chơi", () => {
    expect(system.token("colors.pen.blue")).toBe("#1e4fd8");
    expect(system.token("colors.pen.red")).toBe("#d8341e");
  });

  it("có bóng cứng và font viết tay", () => {
    expect(system.token("shadows.sticker")).toContain("5px 5px 0");
    expect(system.token("fonts.hand")).toContain("--font-hand");
  });
});
