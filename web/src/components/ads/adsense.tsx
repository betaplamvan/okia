"use client";

import { Box } from "@chakra-ui/react";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { useAuth } from "@/stores/auth";

/**
 * Quảng cáo Google AdSense (docs/10 — Quảng cáo). Bật khi build có `NEXT_PUBLIC_ADSENSE_CLIENT`
 * (ca-pub-…). Người đã ủng hộ (`user.adFree`, docs/10 — Donate) KHÔNG tải script, không có ô nào:
 * nhanh hơn thật chứ không chỉ ẩn. Chưa được AdSense duyệt thì ô trống, không chiếm chỗ.
 */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** Dùng hook này ở nơi đặt ô: true = người này có quảng cáo. */
export function useAdsEnabled(): boolean {
  const user = useAuth((s) => s.user);
  // Chưa biết người dùng (đang boot) → chưa hiện, tránh nháy quảng cáo với người đã ủng hộ.
  return !!ADSENSE_CLIENT && !!user && !user.adFree;
}

/** Nạp script AdSense một lần (AppShell), sau khi trang tương tác được. */
export function AdSenseScript() {
  const enabled = useAdsEnabled();
  if (!enabled) return null;
  return (
    <Script
      id="adsense"
      async
      strategy="afterInteractive"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
      crossOrigin="anonymous"
    />
  );
}

type SlotProps = {
  /** data-ad-slot của đơn vị quảng cáo tạo trong AdSense; trống → không render. */
  slot: string | undefined;
  /** Chiều cao tối thiểu để bố cục không nhảy khi quảng cáo tải. */
  minH?: string;
};

/** Một ô quảng cáo hiển thị (responsive). Không đặt gần bàn cờ đang chơi. */
export function AdSlot({ slot, minH = "90px" }: SlotProps) {
  const enabled = useAdsEnabled();
  const pushed = useRef(false);
  useEffect(() => {
    if (!enabled || !slot || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* script chưa nạp / bị chặn → ô trống */
    }
  }, [enabled, slot]);
  if (!enabled || !slot) return null;
  return (
    <Box w="full" minH={minH} overflow="hidden" data-testid="ad-slot">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </Box>
  );
}
