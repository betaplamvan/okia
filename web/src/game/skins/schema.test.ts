// Chuẩn gói skin (shared/skins/schema.json + SPEC.md, ADR-0014): mọi skin trong repo và hai gói mẫu
// qua được bộ kiểm tra JS (cùng quy tắc với API); lỗi thường gặp bị bắt với thông điệp dễ hiểu.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PackageError,
  checkFile,
  readPackageDir,
  refs,
  validateManifest,
} from "../../../scripts/lib/skin-schema.mjs";
import { assetUrl, isAssetRef, skinAssetUrls, type SkinManifest } from "./skins";

const SHARED = join(__dirname, "../../../../shared/skins");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as SkinManifest;

describe("schema skin", () => {
  it("mọi skin seed trong repo hợp lệ và không tham chiếu file", () => {
    for (const type of ["pen", "box"]) {
      for (const f of readdirSync(join(SHARED, type)).filter((f) => f.endsWith(".json"))) {
        const m = validateManifest(read(join(SHARED, type, f)), new Set(), { allowDefault: true });
        expect(m.id).toBe(f.replace(/\.json$/, ""));
        expect(refs(m)).toEqual([]);
      }
    }
  });

  it("hai gói mẫu đọc được, đủ file, đúng tham chiếu", () => {
    const pen = readPackageDir(join(SHARED, "_template/pen_example"));
    expect([...pen.files.keys()].sort()).toEqual([
      "particles/shape.svg",
      "pen/texture.png",
      "sfx/capture.webm",
      "sfx/combo.webm",
    ]);
    const box = readPackageDir(join(SHARED, "_template/box_example"));
    expect(box.manifest.box.effect).toBe("image");
    expect([...box.files.keys()].sort()).toEqual(["box/stamp.svg", "particles/shape.svg"]);
  });

  it("lỗi thường gặp có thông điệp rõ", () => {
    const m = read(join(SHARED, "_template/box_example/skin.json"));
    const files = new Set(["box/stamp.svg", "particles/shape.svg"]);
    expect(() => validateManifest(m, new Set(["particles/shape.svg"]))).toThrow(
      "thiếu file box/stamp.svg",
    );
    expect(() => validateManifest({ ...m, id: "pen_example" }, files)).toThrow(
      "id phải bắt đầu bằng box_",
    );
    expect(() => validateManifest({ ...m, rarity: "gold" }, files)).toThrow("rarity");
    expect(() => validateManifest({ ...m, default: true }, files)).toThrow("default");
    expect(() => validateManifest({ ...m, extra: 1 }, files)).toThrow("extra");
    const pen = read(join(SHARED, "_template/pen_example/skin.json"));
    if (pen.type !== "pen") throw new Error("mẫu phải là bút");
    const same = { ...pen, forms: { mine: pen.forms.mine, opponent: pen.forms.mine } };
    expect(() => validateManifest(same, new Set(refs(pen)))).toThrow("khác màu");
    expect(() => checkFile("box/evil.svg", Buffer.from("<svg><script>1</script></svg>"))).toThrow(
      PackageError,
    );
    expect(() => checkFile("sfx/a.png", Buffer.alloc(8))).toThrow("không nhận .png");
    expect(() => checkFile("box/a.png", Buffer.from("notpng"))).toThrow("không đúng định dạng");
    expect(checkFile("README.md", Buffer.from("x"))).toBe("");
  });
});

describe("assetUrl", () => {
  const skin = {
    ...read(join(SHARED, "_template/box_example/skin.json")),
    assets: {
      ver: "abcdef0123",
      files: ["box/stamp.svg"],
      base: "https://api.test/skins/assets/box_example/abcdef0123/",
    },
  } as SkinManifest;
  it("phân giải tham chiếu trong gói, bỏ qua tên sprite / file không có", () => {
    expect(isAssetRef("sfx/capture.webm")).toBe(true);
    expect(isAssetRef("capture_bell")).toBe(false);
    expect(assetUrl(skin, "box/stamp.svg")).toBe(
      "https://api.test/skins/assets/box_example/abcdef0123/box/stamp.svg",
    );
    expect(assetUrl(skin, "particles/shape.svg")).toBeNull(); // không trong files
    expect(assetUrl({ ...skin, assets: undefined }, "box/stamp.svg")).toBeNull();
    expect(skinAssetUrls(skin)).toEqual({
      images: [
        { url: "https://api.test/skins/assets/box_example/abcdef0123/box/stamp.svg", ext: "svg" },
      ],
      sounds: [],
    });
    // Xem trước ở admin: blob cục bộ ưu tiên hơn base.
    const local = {
      ...skin,
      assets: { ...skin.assets!, urls: { "box/stamp.svg": "blob:http://x/1" } },
    } as SkinManifest;
    expect(assetUrl(local, "box/stamp.svg")).toBe("blob:http://x/1");
    expect(skinAssetUrls(local).images).toEqual([{ url: "blob:http://x/1", ext: "svg" }]);
  });
});
