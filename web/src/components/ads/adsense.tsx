"use client";

import { Box } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
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

/**
 * Người này có quảng cáo không. `real`: AdSense thật (có mã, chưa ủng hộ); `mock`: vùng giả "AD here"
 * (thông số admin ads_mock, để thử bố cục khi chưa được duyệt) — người đã ủng hộ không thấy cả hai.
 * Chưa biết người dùng (đang boot) → chưa hiện, tránh nháy quảng cáo với người đã ủng hộ.
 */
export function useAdsEnabled(): { real: boolean; mock: boolean } {
  const user = useAuth((s) => s.user);
  const adsMock = useAuth((s) => s.site.adsMock);
  const eligible = !!user && !user.adFree;
  return { real: eligible && !!ADSENSE_CLIENT, mock: eligible && adsMock };
}

/** Nạp script AdSense một lần (AppShell), sau khi trang tương tác được. */
export function AdSenseScript() {
  const { real } = useAdsEnabled();
  if (!real) return null;
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
  /** data-ad-slot của đơn vị quảng cáo tạo trong AdSense; trống → không render ô thật. */
  slot: string | undefined;
  /** Tên vị trí (hiện trong vùng giả). */
  name: string;
  /** Chiều cao tối thiểu để bố cục không nhảy khi quảng cáo tải. */
  minH?: string;
};

/** Một ô quảng cáo hiển thị (responsive). Không đặt gần bàn cờ đang chơi. */
export function AdSlot({ slot, name, minH = "90px" }: SlotProps) {
  const { real, mock } = useAdsEnabled();
  const t = useTranslations("Ads");
  const active = real && !!slot;
  const pushed = useRef(false);
  useEffect(() => {
    if (!active || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* script chưa nạp / bị chặn → ô trống */
    }
  }, [active]);
  if (!active && mock) {
    return (
      <Box
        w="full"
        minH={minH}
        border="2px dashed"
        borderColor="cream"
        borderRadius="lg"
        display="flex"
        alignItems="center"
        justifyContent="center"
        color="cream"
        fontFamily="hand"
        fontWeight="700"
        opacity={0.85}
        data-testid="ad-mock"
      >
        {t("mock", { name })}
      </Box>
    );
  }
  if (!active) return null;
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
