"use client";

import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
import { ConfigTab } from "@/components/admin/admin-config";
import { AdminDonations } from "@/components/admin/admin-donations";
import { AdminSkins, AdminUsers } from "@/components/admin/admin-manage";
import { toaster } from "@/components/ui/toaster";
import { type AdminStats, ApiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";

type AdminTab = "stats" | "users" | "skins" | "config" | "donations";

/** Gọi API kèm Bearer qua store; lỗi → toast, ném lại để caller dừng. */
export async function adminCall<T>(
  path: string,
  init?: Parameters<ReturnType<typeof useAuth.getState>["authed"]>[1],
): Promise<T> {
  try {
    return await useAuth.getState().authed<T>(path, init);
  } catch (e) {
    toaster.error({ title: e instanceof ApiError && e.message ? e.message : String(e) });
    throw e;
  }
}

// Trang quản trị /admin (docs/13 — Admin): chỉ tài khoản trong ADMIN_EMAILS (API tự chặn 403).
// Bốn tab: Thống kê · Người chơi · Skin · Thông số.
export function AdminScreen() {
  const t = useTranslations("Admin");
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const [tab, setTab] = useState<AdminTab>("stats");

  if (status === "loading" || status === "idle") {
    return (
      <Container maxW="4xl" px={4} py={6}>
        <Text color="cream">{t("loading")}</Text>
      </Container>
    );
  }
  if (!user?.isAdmin) {
    return (
      <Container maxW="4xl" px={4} py={6}>
        <Box layerStyle="sticker" p={5} textAlign="center">
          <Heading size="lg" mb={2}>
            {t("title")}
          </Heading>
          <Text>{t("forbidden")}</Text>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxW="6xl" px={{ base: 2, md: 4 }} py={{ base: 3, md: 5 }} flex="1">
      <Stack gap={4}>
        <Heading size="xl" color="cream">
          {t("title")}
        </Heading>
        <Tabs.Root
          value={tab}
          onValueChange={(e) => setTab(e.value as AdminTab)}
          variant="plain"
          lazyMount
        >
          <Tabs.List gap={2} flexWrap="wrap">
            {(["stats", "users", "skins", "config", "donations"] as const).map((key) => (
              <Tabs.Trigger
                key={key}
                value={key}
                bg={tab === key ? "mint" : "paper"}
                color="ink"
                border="sticker"
                borderRadius="full"
                boxShadow={tab === key ? "stickerSm" : "sticker"}
                px={4}
                fontWeight="600"
                fontFamily="hand"
              >
                {t(`tab.${key}`)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="stats" pt={4}>
            <StatsTab />
          </Tabs.Content>
          <Tabs.Content value="users" pt={4}>
            <AdminUsers />
          </Tabs.Content>
          <Tabs.Content value="skins" pt={4}>
            <AdminSkins />
          </Tabs.Content>
          <Tabs.Content value="config" pt={4}>
            <ConfigTab />
          </Tabs.Content>
          <Tabs.Content value="donations" pt={4}>
            <AdminDonations />
          </Tabs.Content>
        </Tabs.Root>
      </Stack>
    </Container>
  );
}

// ---------- Thống kê ----------

function StatsTab() {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [at, setAt] = useState<number>(0);
  const load = useCallback(
    () =>
      adminCall<AdminStats>("/admin/stats")
        .then((s) => {
          setStats(s);
          setAt(Date.now());
        })
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    const id = setInterval(load, 10_000);
    load();
    return () => clearInterval(id);
  }, [load]);

  const tiles: [string, number | string][] = stats
    ? [
        [t("stat.online"), stats.online],
        [t("stat.connections"), stats.connections],
        [t("stat.roomsPlaying"), stats.roomsPlaying],
        [t("stat.queueWaiting"), stats.queueWaiting],
        [t("stat.pendingMatches"), stats.pendingMatches],
        [t("stat.matchesToday"), stats.matchesToday],
        [t("stat.matchesTotal"), stats.matchesTotal],
        [t("stat.usersToday"), stats.usersToday],
        [t("stat.accountsTotal"), stats.accountsTotal],
        [t("stat.usersTotal"), stats.usersTotal],
      ]
    : [];
  return (
    <Stack gap={3}>
      <HStack justify="space-between">
        <Text color="cream" fontSize="sm">
          {stats?.season ? t("stat.season", { name: stats.season.name.vi }) : t("loading")}
          {at ? ` · ${format.dateTime(new Date(at), { timeStyle: "medium" })}` : ""}
        </Text>
        <Button variant="sticker" size="sm" onClick={() => void load()}>
          <LuRefreshCw /> {t("refresh")}
        </Button>
      </HStack>
      <SimpleGrid columns={{ base: 2, md: 5 }} gap={3}>
        {tiles.map(([label, value]) => (
          <Box key={label} layerStyle="sticker" p={3} textAlign="center" bg="paper">
            <Text fontSize="3xl" fontWeight="700" lineHeight="1.1">
              {typeof value === "number" ? format.number(value) : value}
            </Text>
            <Text fontSize="sm" opacity={0.8}>
              {label}
            </Text>
          </Box>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap={1}>
      <Text fontWeight="700">{label}</Text>
      {hint ? (
        <Text fontSize="xs" opacity={0.7}>
          {hint}
        </Text>
      ) : null}
      {children}
    </Stack>
  );
}
