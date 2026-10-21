"use client";

import { Box, Button, HStack, Input, Separator, Stack, Text } from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { LuLogOut, LuTrash2 } from "react-icons/lu";
import { toaster } from "@/components/ui/toaster";
import { usePathname } from "@/i18n/navigation";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";

// Tab "Tài khoản" (docs/13, ADR-0011): khách → đăng nhập Google; tài khoản → email, đăng xuất, xóa.
// Không có mật khẩu. Lỗi từ API đã có message dịch sẵn → hiện thẳng.
export function AccountTab() {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  return user.isGuest ? <GuestLink /> : <AccountManage />;
}

function showError(e: unknown, fallback: string) {
  toaster.error({ title: e instanceof ApiError && e.message ? e.message : fallback });
}

export function GoogleButton({ label }: { label: string }) {
  const t = useTranslations("Auth");
  const googleStart = useAuth((s) => s.googleStart);
  const pathname = usePathname();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="sticker"
      w="full"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const returnTo = locale === "vi" ? pathname : `/${locale}${pathname}`;
          window.location.assign(await googleStart(returnTo));
        } catch (e) {
          showError(e, t("errorGeneric"));
          setBusy(false);
        }
      }}
    >
      <FcGoogle /> {label}
    </Button>
  );
}

// ---------- Khách ----------

function GuestLink() {
  const t = useTranslations("Auth");
  return (
    <Stack gap={4}>
      <Text>{t("linkIntro")}</Text>
      <GoogleButton label={t("google")} />
      <Text fontSize="sm" opacity={0.75}>
        {t("switchedWarn")}
      </Text>
    </Stack>
  );
}

// ---------- Tài khoản thật ----------

function AccountManage() {
  const t = useTranslations("Auth");
  const user = useAuth((s) => s.user)!;
  const logout = useAuth((s) => s.logout);
  const logoutAll = useAuth((s) => s.logoutAll);
  const deleteMe = useAuth((s) => s.deleteMe);
  const closeProfile = useAuth((s) => s.closeProfile);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toaster.success({ title: ok });
    } catch (e) {
      showError(e, t("errorGeneric"));
    }
  };

  return (
    <Stack gap={4}>
      <Box>
        <Text fontWeight="700">{t("email")}</Text>
        <Text truncate>{user.email}</Text>
        <HStack mt={1} fontSize="sm" opacity={0.8}>
          <FcGoogle /> <Text>{t("googleLinked")}</Text>
        </HStack>
      </Box>

      <Separator borderColor="ink" />

      <Stack gap={2}>
        <Button
          variant="sticker"
          onClick={() =>
            run(async () => {
              await logout();
              closeProfile();
            })
          }
        >
          <LuLogOut /> {t("logout")}
        </Button>
        <Button
          variant="sticker"
          size="sm"
          onClick={() =>
            run(async () => {
              await logoutAll();
              closeProfile();
            })
          }
        >
          {t("logoutAll")}
        </Button>
        {confirmDelete ? (
          <Box bg="coral" border="2px solid" borderColor="ink" borderRadius="lg" p={3}>
            <Text mb={2}>{t("deleteConfirm")}</Text>
            <HStack>
              <Button
                size="sm"
                variant="sticker"
                bg="paper"
                onClick={() =>
                  run(async () => {
                    await deleteMe();
                    closeProfile();
                  }, t("deleted"))
                }
              >
                {t("deleteAccount")}
              </Button>
              <Button size="sm" variant="sticker" onClick={() => setConfirmDelete(false)}>
                {t("cancel")}
              </Button>
            </HStack>
          </Box>
        ) : (
          <Button variant="plain" color="ink" size="sm" onClick={() => setConfirmDelete(true)}>
            <LuTrash2 /> {t("deleteAccount")}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

/** Ô nhập tông giấy: viền đen 2px, nền trắng. */
export function TextInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      bg="white"
      color="ink"
      border="2px solid"
      borderColor="ink"
      borderRadius="lg"
      fontFamily="hand"
      fontSize="lg"
      _focusVisible={{ outline: "3px solid", outlineColor: "sun", outlineOffset: "1px" }}
      {...props}
    />
  );
}
