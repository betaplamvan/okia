import type { MetadataRoute } from "next";

// Web app manifest: icon nền vàng (public/brand, sinh bởi scripts/build-brand.mjs) cho "Thêm vào
// màn hình chính" trên Android; màu nền/theme theo bảng màu sticker (docs/14).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ô Kìa",
    short_name: "Ô Kìa",
    description: "Trò ăn ô trên giấy ô li — chơi với máy, đấu xếp hạng hoặc tạo phòng rủ bạn bè.",
    start_url: "/",
    display: "standalone",
    background_color: "#35544a",
    theme_color: "#35544a",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
