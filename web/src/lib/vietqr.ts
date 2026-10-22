/**
 * Chuỗi VietQR (NAPAS, chuẩn EMVCo QR — docs/10 — Donate): chuyển khoản tới số tài khoản
 * (QRIBFTTA) với số tiền và nội dung điền sẵn. Sinh tại client, không gọi dịch vụ ngoài.
 *
 *   00 02 01                 Payload Format Indicator
 *   01 02 12                 Point of Initiation (12 = động, có số tiền; 11 = tĩnh)
 *   38 xx  [00 10 A000000727 · 01 xx [00 06 <BIN> · 01 xx <STK>] · 02 08 QRIBFTTA]
 *   53 03 704                VND · 54 xx <số tiền> · 58 02 VN
 *   62 xx  [08 xx <nội dung>]  · 63 04 <CRC16-CCITT-FALSE>
 */

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — hex hoa 4 ký tự. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Bỏ dấu tiếng Việt + ký tự lạ cho nội dung chuyển khoản (ngân hàng chỉ nhận ASCII, ≤ 25 ký tự). */
export function transferNote(s: string, max = 25): string {
  const ascii = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ascii.slice(0, max).trim();
}

export function vietqrPayload(opts: {
  bin: string;
  accountNo: string;
  amount?: number | null;
  note?: string;
}): string {
  const account = tlv("00", opts.bin) + tlv("01", opts.accountNo);
  const merchant = tlv("00", "A000000727") + tlv("01", account) + tlv("02", "QRIBFTTA");
  const dynamic = !!opts.amount && opts.amount > 0;
  let p =
    tlv("00", "01") + tlv("01", dynamic ? "12" : "11") + tlv("38", merchant) + tlv("53", "704");
  if (dynamic) p += tlv("54", String(Math.round(opts.amount!)));
  p += tlv("58", "VN");
  const note = opts.note ? transferNote(opts.note) : "";
  if (note) p += tlv("62", tlv("08", note));
  p += "6304";
  return p + crc16(p);
}
