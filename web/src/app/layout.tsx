import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Patrick_Hand } from "next/font/google";
import { Provider } from "@/components/ui/provider";

// Font UI: có subset tiếng Việt, không phải variable font nên phải khai báo weight.
const fontSans = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Font viết tay cho bàn đấu / HUD. Subset tiếng Việt được kiểm tra lại ở P0-04.
const fontHand = Patrick_Hand({
  variable: "--font-hand",
  subsets: ["latin", "vietnamese"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ô Kìa",
  description: "Ô Kìa — trò ăn ô trên giấy ô li",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Để safe-area-inset-* có hiệu lực trên iOS.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes gán class color mode lên <html> trước khi hydrate.
    <html
      lang="vi"
      className={`${fontSans.variable} ${fontHand.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
