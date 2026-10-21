"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { ProfileDialog } from "@/components/auth/profile-dialog";
import { GiftDialog } from "@/components/economy/gift-dialog";
import { toaster } from "@/components/ui/toaster";
import { useAuth } from "@/stores/auth";

const OAUTH_CODES = new Set([
  "OAUTH_CANCELLED",
  "IDENTITY_TAKEN",
  "OAUTH_FAILED",
  "OAUTH_STATE",
  "OAUTH_EMAIL_UNVERIFIED",
  "GOOGLE_DISABLED",
]);

// Khởi động phiên (refresh → khách) và xử lý kết quả quay về từ Google (?auth=google|error).
export function AuthProvider() {
  const locale = useLocale();
  const t = useTranslations("Auth");
  const boot = useAuth((s) => s.boot);
  const openProfile = useAuth((s) => s.openProfile);

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

  return (
    <>
      <ProfileDialog />
      <GiftDialog />
    </>
  );
}
