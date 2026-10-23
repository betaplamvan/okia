"use client";

import { Box, Button, Portal, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { usePathname } from "@/i18n/navigation";
import { type AuthState, useAuth } from "@/stores/auth";

/**
 * Quảng cáo Google AdSense (docs/10 — Quảng cáo). Bật khi build có `NEXT_PUBLIC_ADSENSE_CLIENT`
 * (ca-pub-…). Người đã ủng hộ (`user.adFree`, docs/10 — Donate) KHÔNG tải script, không có ô nào.
 *
 * Chiến thuật hiển thị:
 *   - vùng trên trang: giữa các thẻ chế độ ở trang chủ, cuối trang Shop / Bảng xếp hạng, hai bên lề
 *     trên màn PC rộng (không ở màn đang chơi);
 *   - quảng cáo xen: sau khi kết thúc ván và bấm "Ván mới" / "Chơi lại", cứ 3 ván một lần
 *     (Ad Placement API `adBreak({type: "next"})`; chưa được Google cho phép thì bỏ qua ngay).
 *
 * Vùng giả "AD here" (thông số admin `ads_mock`): thử bố cục khi chưa được duyệt — người chưa ủng hộ
 * thấy, và **admin luôn thấy** (để xem trước dù tài khoản admin đã ủng hộ).
 */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
/** Quảng cáo xen cứ N ván kết thúc một lần. */
export const INTERSTITIAL_EVERY = 3;
const GAMES_KEY = "okia-ad-games";

type AdBreak = (o: {
  type: "next" | "start" | "pause";
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  adBreakDone?: (info?: unknown) => void;
}) => void;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    adBreak?: AdBreak;
    adConfig?: (o: Record<string, unknown>) => void;
  }
}

type AdsInput = Pick<AuthState, "user" | "status" | "site">;

/**
 * Người này có quảng cáo không. `real`: AdSense thật (có mã, chưa ủng hộ); `mock`: vùng giả.
 * Đang boot (chưa biết người dùng) → chưa hiện, tránh nháy quảng cáo với người đã ủng hộ. Boot xong mà
 * không có phiên (tạo khách lỗi / quá giới hạn theo IP — mạng 4G chung IP) → coi như khách chưa ủng hộ.
 */
function adsFor({ user, status, site }: AdsInput): { real: boolean; mock: boolean } {
  const known = !!user || status === "ready" || status === "offline";
  const eligible = known && !user?.adFree;
  return {
    real: eligible && !!ADSENSE_CLIENT,
    mock: site.adsMock && known && (eligible || !!user?.isAdmin),
  };
}

export function useAdsEnabled(): { real: boolean; mock: boolean } {
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const site = useAuth((s) => s.site);
  return adsFor({ user, status, site });
}

function adsState() {
  return adsFor(useAuth.getState());
}

/** Nạp script AdSense một lần (AppShell), sau khi trang tương tác được; khai báo Ad Placement API. */
export function AdSenseScript() {
  const { real } = useAdsEnabled();
  if (!real) return null;
  return (
    <>
      <Script id="adsense-adbreak" strategy="afterInteractive">
        {`window.adsbygoogle=window.adsbygoogle||[];window.adBreak=window.adConfig=function(o){window.adsbygoogle.push(o);};window.adConfig({preloadAdBreaks:"on",sound:"on"});`}
      </Script>
      <Script
        id="adsense"
        async
        strategy="afterInteractive"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
        crossOrigin="anonymous"
        data-ad-frequency-hint="60s"
      />
    </>
  );
}

// ---------- Ô quảng cáo trên trang ----------

type SlotProps = {
  /** data-ad-slot của đơn vị quảng cáo tạo trong AdSense; trống → không render ô thật. */
  slot: string | undefined;
  /** Tên vị trí (hiện trong vùng giả). */
  name: string;
  /** Chiều cao tối thiểu để bố cục không nhảy khi quảng cáo tải. */
  minH?: string;
  /** Kéo dài hết hàng trong một grid (giữa các thẻ). */
  span?: boolean;
  /** Ô dọc (lề PC). */
  vertical?: boolean;
};

/** Một ô quảng cáo hiển thị (responsive). Không đặt trong màn đang chơi. */
export function AdSlot({ slot, name, minH = "90px", span, vertical }: SlotProps) {
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
  const gridColumn = span ? "1 / -1" : undefined;
  if (!active && mock) {
    return (
      <Box
        gridColumn={gridColumn}
        w="full"
        minH={minH}
        h={vertical ? "full" : undefined}
        border="2px dashed"
        borderColor="cream"
        borderRadius="lg"
        display="flex"
        alignItems="center"
        justifyContent="center"
        textAlign="center"
        color="cream"
        fontFamily="hand"
        fontWeight="700"
        opacity={0.85}
        p={2}
        style={vertical ? { writingMode: "vertical-rl" } : undefined}
        data-testid="ad-mock"
      >
        {t("mock", { name })}
      </Box>
    );
  }
  if (!active) return null;
  return (
    <Box gridColumn={gridColumn} w="full" minH={minH} overflow="hidden" data-testid="ad-slot">
      <ins
        className="adsbygoogle"
        style={{ display: "block", height: vertical ? "600px" : undefined }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={vertical ? "vertical" : "auto"}
        data-full-width-responsive={vertical ? "false" : "true"}
      />
    </Box>
  );
}

/**
 * Hai cột quảng cáo dọc sát hai mép màn hình PC rộng (≥ 1280 px, nội dung 896 px ở giữa). Không hiện
 * ở màn đang chơi (/play, /r/…) để không làm phân tâm.
 */
export function AdRails() {
  const pathname = usePathname();
  const { real, mock } = useAdsEnabled();
  const slot = process.env.NEXT_PUBLIC_ADSENSE_SLOT_RAIL;
  if (pathname === "/play" || pathname.startsWith("/r/")) return null;
  if (!(mock || (real && slot))) return null;
  const rail = (side: "left" | "right") => (
    <Box
      key={side}
      display={{ base: "none", xl: "block" }}
      position="fixed"
      top="140px"
      {...{ [side]: "16px" }}
      w="160px"
      h="600px"
      zIndex={1}
      data-testid={`ad-rail-${side}`}
    >
      <AdSlot slot={slot} name={`rail-${side}`} minH="600px" vertical />
    </Box>
  );
  return (
    <>
      {rail("left")}
      {rail("right")}
    </>
  );
}

// ---------- Quảng cáo xen sau ván ----------

type InterstitialState = { open: boolean; done: (() => void) | null };
const useInterstitial = create<InterstitialState>()(() => ({ open: false, done: null }));

/** Quảng cáo xen đang hiện? (màn chơi giữ hộp kết quả đóng trong lúc này). */
export function useInterstitialOpen(): boolean {
  return useInterstitial((s) => s.open);
}

function bumpGames(): number {
  try {
    const n = (Number(localStorage.getItem(GAMES_KEY)) || 0) + 1;
    localStorage.setItem(GAMES_KEY, String(n));
    return n;
  } catch {
    return 0; // không có storage → không xen quảng cáo
  }
}

/**
 * Gọi khi người chơi bấm "Ván mới" / "Chơi lại" SAU khi ván đã kết thúc: cứ INTERSTITIAL_EVERY ván
 * một lần chen quảng cáo rồi mới chạy `next`. Người đã ủng hộ / không có quảng cáo → chạy ngay.
 */
export function afterFinishedGame(next: () => void) {
  const { real, mock } = adsState();
  if (!real && !mock) {
    next();
    return;
  }
  const n = bumpGames();
  if (n === 0 || n % INTERSTITIAL_EVERY !== 0) {
    next();
    return;
  }
  if (real && typeof window.adBreak === "function") {
    let called = false;
    const finish = () => {
      if (called) return;
      called = true;
      next();
    };
    // Google tự quyết có quảng cáo hay không (tần suất, chưa duyệt) → luôn gọi adBreakDone.
    window.adBreak({ type: "next", name: "new_game", adBreakDone: finish });
    setTimeout(finish, 8000); // phòng khi API không bao giờ trả lời
    return;
  }
  if (mock) {
    useInterstitial.setState({ open: true, done: next });
    return;
  }
  next();
}

/** Lớp phủ quảng cáo xen giả ("AD here · interstitial"), đếm 5 giây rồi cho bỏ qua. Gắn trong AppShell. */
export function InterstitialHost() {
  const t = useTranslations("Ads");
  const { open, done } = useInterstitial();
  const [left, setLeft] = useState(5);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [open]);
  if (!open) return null;
  const close = () => {
    useInterstitial.setState({ open: false, done: null });
    setLeft(5);
    done?.();
  };
  return (
    <Portal>
      <Box
        position="fixed"
        inset={0}
        // Trên cả hộp kết quả ván (Dialog, tầng modal) và toast.
        zIndex={2000}
        bg="rgba(26, 40, 38, 0.92)"
        display="flex"
        alignItems="center"
        justifyContent="center"
        p={4}
        data-testid="ad-interstitial"
      >
        <Stack
          w="min(92vw, 640px)"
          h="min(70vh, 480px)"
          border="3px dashed"
          borderColor="cream"
          borderRadius="xl"
          align="center"
          justify="center"
          color="cream"
          gap={4}
        >
          <Text fontFamily="hand" fontWeight="700" fontSize="3xl">
            {t("mock", { name: "interstitial" })}
          </Text>
          <Text opacity={0.8}>{t("interstitialHint", { n: String(INTERSTITIAL_EVERY) })}</Text>
          <Button
            variant="sticker"
            bg="paper"
            disabled={left > 0}
            onClick={close}
            data-testid="ad-interstitial-close"
          >
            {left > 0 ? t("skipIn", { s: String(left) }) : t("skip")}
          </Button>
        </Stack>
      </Box>
    </Portal>
  );
}
