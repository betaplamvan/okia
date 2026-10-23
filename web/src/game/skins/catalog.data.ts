// File sinh tự động bởi scripts/gen-skins.mjs từ shared/skins/**.json — KHÔNG sửa tay.
import type { SkinManifest } from "./skins";

export const SKIN_SOURCES: readonly SkinManifest[] = [
  {
    id: "pen_default",
    type: "pen",
    rarity: "common",
    name: {
      vi: "Bút bi",
      en: "Ballpoint Pen",
    },
    description: {
      vi: "Nét bút bi quen thuộc, có sẵn cho mọi người.",
      en: "The familiar ballpoint stroke, free for everyone.",
    },
    forms: {
      mine: {
        color: "#1e4fd8",
      },
      opponent: {
        color: "#d8341e",
      },
    },
    pen: {
      style: "flat",
      width: 1,
      alpha: 1,
      jitter: 1,
    },
    combo: {
      style: "sticker",
      particles: "paper",
      shakeFrom: 3,
    },
    sfx: {
      capture: "capture",
      combo: "combo",
    },
    default: true,
  },
  {
    id: "box_default",
    type: "box",
    rarity: "common",
    name: {
      vi: "Gạch chéo",
      en: "Hatch",
    },
    description: {
      vi: "Tô vội vài gạch chéo, kiểu cổ điển.",
      en: "A few quick diagonal hatches, the classic.",
    },
    box: {
      effect: "hatch",
      alpha: 0.22,
      particles: "paper",
    },
    default: true,
  },
  {
    schema: 1,
    id: "throw_bomb",
    type: "throw",
    rarity: "epic",
    name: {
      vi: "Bom",
      en: "Bomb",
    },
    description: {
      vi: "Quả bom hoạt hình: cháy ngòi rồi BÙM, rung cả chip.",
      en: "A cartoon bomb: fuse, then BOOM. The chip shakes.",
    },
    throw: {
      icon: "bomb",
      splat: "explode",
      color: "#1a2826",
      color2: "#ff9f1c",
    },
  },
  {
    schema: 1,
    id: "throw_cake",
    type: "throw",
    rarity: "rare",
    name: {
      vi: "Bánh kem",
      en: "Cream Pie",
    },
    description: {
      vi: "Bánh kem úp thẳng mặt, kem trắng loang lổ.",
      en: "A cream pie straight to the face.",
    },
    throw: {
      icon: "cake",
      splat: "splat",
      color: "#fff6c2",
      color2: "#ff9fd0",
    },
  },
  {
    schema: 1,
    id: "throw_confetti",
    type: "throw",
    rarity: "legendary",
    name: {
      vi: "Pháo giấy",
      en: "Confetti Popper",
    },
    description: {
      vi: "Pháo giấy ăn mừng, chỉ dân chơi vàng mới có.",
      en: "A celebration popper, gold tier only.",
    },
    throw: {
      icon: "confetti",
      splat: "confetti",
      color: "#ffd93d",
      color2: "#ff6fbc",
    },
  },
  {
    schema: 1,
    id: "throw_egg",
    type: "throw",
    rarity: "uncommon",
    name: {
      vi: "Trứng gà",
      en: "Egg",
    },
    description: {
      vi: "Trứng tươi, vỡ ra chảy lòng vàng.",
      en: "A fresh egg that cracks and drips yolk.",
    },
    throw: {
      icon: "egg",
      splat: "crack",
      color: "#ffd93d",
      color2: "#fff6c2",
    },
  },
  {
    schema: 1,
    id: "throw_flower",
    type: "throw",
    rarity: "uncommon",
    name: {
      vi: "Bó hoa",
      en: "Bouquet",
    },
    description: {
      vi: "Tặng hoa cho đối thủ chơi hay. Cánh hoa bay tứ tung.",
      en: "Flowers for a worthy opponent. Petals everywhere.",
    },
    throw: {
      icon: "flower",
      splat: "petals",
      color: "#ff6fbc",
      color2: "#7cf5c5",
    },
  },
  {
    schema: 1,
    id: "throw_paper",
    type: "throw",
    rarity: "common",
    name: {
      vi: "Giấy vo",
      en: "Paper Ball",
    },
    description: {
      vi: "Một tờ giấy nháp vo tròn. Ai cũng có sẵn để ném chơi.",
      en: "A crumpled scrap of paper. Everyone has one to throw.",
    },
    throw: {
      icon: "paper",
      splat: "bounce",
      color: "#f5f1e8",
      color2: "#cfc7b6",
    },
    default: true,
  },
  {
    schema: 1,
    id: "throw_slipper",
    type: "throw",
    rarity: "rare",
    name: {
      vi: "Dép lào",
      en: "Slipper",
    },
    description: {
      vi: "Dép tổ ong huyền thoại, ném là trúng.",
      en: "The legendary honeycomb slipper. Never misses.",
    },
    throw: {
      icon: "slipper",
      splat: "bounce",
      color: "#1e4fd8",
      color2: "#8ec5ff",
    },
  },
  {
    schema: 1,
    id: "throw_tomato",
    type: "throw",
    rarity: "common",
    name: {
      vi: "Cà chua",
      en: "Tomato",
    },
    description: {
      vi: "Cà chua chín, trúng là toé đỏ cả chip.",
      en: "A ripe tomato; splatters red all over the chip.",
    },
    throw: {
      icon: "tomato",
      splat: "splat",
      color: "#e5321c",
      color2: "#ff6b4a",
    },
  },
];
