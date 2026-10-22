import { describe, expect, it } from "vitest";
import { crc16, transferNote, vietqrPayload } from "./vietqr";

describe("vietqr", () => {
  it("CRC-16/CCITT-FALSE đúng vector chuẩn", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
  it("nội dung bỏ dấu, ASCII, ≤ 25 ký tự", () => {
    expect(transferNote("OKIA Bé Na — đội 1!")).toBe("OKIA Be Na doi 1");
    expect(transferNote("OKIA " + "a".repeat(40))).toHaveLength(25);
  });
  it("chuỗi EMVCo đúng cấu trúc, CRC ở cuối", () => {
    const p = vietqrPayload({
      bin: "970422",
      accountNo: "0123456789",
      amount: 20000,
      note: "OKIA An",
    });
    expect(p.startsWith("000201010212")).toBe(true);
    expect(p).toContain("0010A000000727");
    expect(p).toContain("0006970422");
    expect(p).toContain("01100123456789");
    expect(p).toContain("0208QRIBFTTA");
    expect(p).toContain("5303704");
    expect(p).toContain("540520000");
    expect(p).toContain("5802VN");
    expect(p).toContain("62110807OKIA An");
    const body = p.slice(0, -4);
    expect(body.endsWith("6304")).toBe(true);
    expect(p.slice(-4)).toBe(crc16(body));
    // Tĩnh (không số tiền) → 010211, không có 54.
    const s = vietqrPayload({ bin: "970422", accountNo: "0123456789" });
    expect(s.startsWith("000201010211")).toBe(true);
    expect(s).not.toContain("5405");
  });
});
