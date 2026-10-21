"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { ProfileDialog } from "@/components/auth/profile-dialog";
import { SessionReplacedDialog } from "@/components/auth/session-replaced-dialog";
import { GiftDialog } from "@/components/economy/gift-dialog";
import { toaster } from "@/components/ui/toaster";
import { SESSION_REPLACED_KEY, useAuth } from "@/stores/auth";

const OAUTH_CODES = new Set([
  "OAUTH_CANCELLED",
  "IDENTITY_TAKEN",
  "OAUTH_FAILED",
  "OAUTH_STATE",
  "OAUTH_EMAIL_UNVERIFIED",
  "GOOGLE_DISABLED",
]);

// Tab đang mở mà không có WS (trang chủ, chơi với máy) vẫn cần biết khi tài khoản đăng nhập nơi
// khác: hỏi lại khi quay về tab và định kỳ lúc tab đang hiện (docs/13 — Một phiên mỗi tài khoản).
const SESSION_CHECK_MS = 60_000;
const SESSION_CHECK_MIN_GAP_MS = 10_000;

// Khởi động phiên (refresh → khách) và xử lý kết quả quay về từ Google (?auth=google|error).
export function AuthProvider() {
  const locale = useLocale();
  const t = useTranslations("Auth");
  const boot = useAuth((s) => s.boot);
  const openProfile = useAuth((s) => s.openProfile);
  const checkSession = useAuth((s) => s.checkSession);
  const replacedInOtherTab = useAuth((s) => s.replacedInOtherTab);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    void boot(locale).then(() => {
      if (!auth) return;
      if (auth === "google") {
        toaster.success({
          title: params.get("switched") === "1" ? t("switched") : t("googleOk"),
        });
        openProfile("account");
      } else if (auth === "error") {
        const code = params.get("code") ?? "";
        toaster.error({
          title: t(
            `oauthError.${OAUTH_CODES.has(code) ? (code as "OAUTH_FAILED") : "OAUTH_FAILED"}`,
          ),
        });
      }
      params.delete("auth");
      params.delete("code");
      params.delete("switched");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    });
  }, [boot, locale, openProfile, t]);

  useEffect(() => {
    let last = Date.now();
    const check = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < SESSION_CHECK_MIN_GAP_MS) return;
      last = Date.now();
      void checkSession();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_REPLACED_KEY) void replacedInOtherTab();
    };
    const timer = setInterval(check, SESSION_CHECK_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", onStorage);
    };
  }, [checkSession, replacedInOtherTab]);

  return (
    <>
      <ProfileDialog />
      <GiftDialog />
      <SessionReplacedDialog />
    </>
  );
}
