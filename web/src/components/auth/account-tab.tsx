"use client";

import { Box, Button, Field, HStack, Input, Separator, Stack, Text } from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { LuLogOut, LuMail, LuTrash2 } from "react-icons/lu";
import { toaster } from "@/components/ui/toaster";
import { usePathname } from "@/i18n/navigation";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";

// Tab "Tài khoản" (docs/13): khách → liên kết (Google / email); tài khoản → email, cách đăng nhập,
// đăng xuất, xóa. Lỗi từ API đã có message dịch sẵn → hiện thẳng.
export function AccountTab() {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  return user.isGuest ? <GuestLink /> : <AccountManage />;
}

function showError(e: unknown, fallback: string) {
  toaster.error({ title: e instanceof ApiError && e.message ? e.message : fallback });
}

function GoogleButton({ label }: { label: string }) {
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
  const [mode, setMode] = useState<"pick" | "register" | "login" | "forgot">("pick");

  return (
    <Stack gap={4}>
      <Text>{t("linkIntro")}</Text>
      {mode === "pick" ? (
        <Stack gap={3}>
          <GoogleButton label={t("google")} />
          <Button variant="sticker" w="full" onClick={() => setMode("register")}>
            <LuMail /> {t("useEmail")}
          </Button>
        </Stack>
      ) : mode === "register" ? (
        <RegisterForm onLogin={() => setMode("login")} />
      ) : mode === "login" ? (
        <LoginForm onRegister={() => setMode("register")} onForgot={() => setMode("forgot")} />
      ) : (
        <ForgotForm onBack={() => setMode("login")} />
      )}
    </Stack>
  );
}

function RegisterForm({ onLogin }: { onLogin: () => void }) {
  const t = useTranslations("Auth");
  const register = useAuth((s) => s.register);
  const user = useAuth((s) => s.user);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const out = await register({
        email: String(f.get("email")),
        password: String(f.get("password")),
        displayName: String(f.get("displayName") || "") || undefined,
      });
      toaster.success({
        title: out.user.isGuest ? t("checkEmail") : t("registered"),
        description: out.user.isGuest ? undefined : (out.user.email ?? undefined),
      });
    } catch (e) {
      showError(e, t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack gap={3}>
        <Field.Root>
          <Field.Label>{t("name")}</Field.Label>
          <TextInput name="displayName" defaultValue={user?.displayName} maxLength={32} />
        </Field.Root>
        <Field.Root required>
          <Field.Label>{t("email")}</Field.Label>
          <TextInput name="email" type="email" autoComplete="email" />
        </Field.Root>
        <Field.Root required>
          <Field.Label>{t("password")}</Field.Label>
          <TextInput name="password" type="password" autoComplete="new-password" minLength={8} />
          <Field.HelperText color="ink" opacity={0.7}>
            {t("passwordHint")}
          </Field.HelperText>
        </Field.Root>
        <Button type="submit" variant="sticker" bg="mint" loading={busy}>
          {t("register")}
        </Button>
        <Button variant="plain" color="ink" textDecoration="underline" onClick={onLogin}>
          {t("haveAccount")}
        </Button>
      </Stack>
    </form>
  );
}

function LoginForm({ onRegister, onForgot }: { onRegister: () => void; onForgot: () => void }) {
  const t = useTranslations("Auth");
  const login = useAuth((s) => s.login);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const out = await login({
        email: String(f.get("email")),
        password: String(f.get("password")),
      });
      toaster.success({ title: out.switched ? t("switched") : t("loggedIn") });
    } catch (e) {
      showError(e, t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack gap={3}>
        <Text fontSize="sm" opacity={0.75}>
          {t("switchedWarn")}
        </Text>
        <Field.Root required>
          <Field.Label>{t("email")}</Field.Label>
          <TextInput name="email" type="email" autoComplete="email" />
        </Field.Root>
        <Field.Root required>
          <Field.Label>{t("password")}</Field.Label>
          <TextInput name="password" type="password" autoComplete="current-password" />
        </Field.Root>
        <Button type="submit" variant="sticker" bg="mint" loading={busy}>
          {t("login")}
        </Button>
        <HStack justify="space-between">
          <Button variant="plain" color="ink" textDecoration="underline" onClick={onRegister}>
            {t("noAccount")}
          </Button>
          <Button variant="plain" color="ink" textDecoration="underline" onClick={onForgot}>
            {t("forgot")}
          </Button>
        </HStack>
      </Stack>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const t = useTranslations("Auth");
  const forgot = useAuth((s) => s.forgot);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await forgot(String(f.get("email")));
      toaster.success({ title: t("forgotSent") });
      onBack();
    } catch (e) {
      showError(e, t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack gap={3}>
        <Field.Root required>
          <Field.Label>{t("email")}</Field.Label>
          <TextInput name="email" type="email" autoComplete="email" />
        </Field.Root>
        <Button type="submit" variant="sticker" bg="mint" loading={busy}>
          {t("sendReset")}
        </Button>
        <Button variant="plain" color="ink" textDecoration="underline" onClick={onBack}>
          {t("back")}
        </Button>
      </Stack>
    </form>
  );
}

// ---------- Tài khoản thật ----------

function AccountManage() {
  const t = useTranslations("Auth");
  const user = useAuth((s) => s.user)!;
  const resendVerify = useAuth((s) => s.resendVerify);
  const removeIdentity = useAuth((s) => s.removeIdentity);
  const logout = useAuth((s) => s.logout);
  const logoutAll = useAuth((s) => s.logoutAll);
  const deleteMe = useAuth((s) => s.deleteMe);
  const closeProfile = useAuth((s) => s.closeProfile);
  const [settingPw, setSettingPw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasPassword = user.identities.some((i) => i.provider === "password");
  const hasGoogle = user.identities.some((i) => i.provider === "google");

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
        {!user.emailVerified ? (
          <Box mt={2} bg="sun" border="2px solid" borderColor="ink" borderRadius="lg" px={3} py={2}>
            <Text fontSize="sm">{t("verifyBanner")}</Text>
            <Button
              size="xs"
              variant="sticker"
              mt={2}
              onClick={() => run(resendVerify, t("resent"))}
            >
              {t("resend")}
            </Button>
          </Box>
        ) : null}
      </Box>

      <Separator borderColor="ink" />

      <Stack gap={2}>
        <Text fontWeight="700">{t("identities")}</Text>
        <HStack justify="space-between">
          <HStack>
            <FcGoogle /> <Text>{hasGoogle ? t("googleLinked") : "Google"}</Text>
          </HStack>
          {hasGoogle ? (
            <Button
              size="xs"
              variant="sticker"
              onClick={() => run(() => removeIdentity("google"), t("unlinked"))}
            >
              {t("unlink")}
            </Button>
          ) : (
            <Box w="60%">
              <GoogleButton label={t("linkGoogle")} />
            </Box>
          )}
        </HStack>
        <HStack justify="space-between" align="flex-start">
          <Text>{hasPassword ? t("passwordSet") : t("passwordNone")}</Text>
          {!hasPassword && !settingPw ? (
            <Button size="xs" variant="sticker" onClick={() => setSettingPw(true)}>
              {t("setPassword")}
            </Button>
          ) : null}
        </HStack>
        {settingPw ? <SetPasswordForm onDone={() => setSettingPw(false)} /> : null}
      </Stack>

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

function SetPasswordForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Auth");
  const setPassword = useAuth((s) => s.setPassword);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await setPassword(String(f.get("password")));
          toaster.success({ title: t("passwordSaved") });
          onDone();
        } catch (err) {
          showError(err, t("errorGeneric"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Stack gap={2}>
        <Field.Root required>
          <Field.Label>{t("password")}</Field.Label>
          <TextInput name="password" type="password" autoComplete="new-password" minLength={8} />
          <Field.HelperText color="ink" opacity={0.7}>
            {t("passwordHint")}
          </Field.HelperText>
        </Field.Root>
        <HStack>
          <Button type="submit" size="sm" variant="sticker" bg="mint" loading={busy}>
            {t("save")}
          </Button>
          <Button size="sm" variant="sticker" onClick={onDone}>
            {t("cancel")}
          </Button>
        </HStack>
      </Stack>
    </form>
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
