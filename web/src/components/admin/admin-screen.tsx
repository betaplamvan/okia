"use client";

import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { LuRefreshCw, LuSave } from "react-icons/lu";
import { AdminDonations } from "@/components/admin/admin-donations";
import { AdminSkins, AdminUsers } from "@/components/admin/admin-manage";
import { toaster } from "@/components/ui/toaster";
import { type AdminConfigOut, type AdminStats, ApiError } from "@/lib/api";
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

// ---------- Thông số ----------

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;

function ConfigTab() {
  const t = useTranslations("Admin");
  const [cfg, setCfg] = useState<AdminConfigOut | null>(null);
  const [draft, setDraft] = useState<AdminConfigOut["values"] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void adminCall<AdminConfigOut>("/admin/config").then((c) => {
      setCfg(c);
      setDraft(structuredClone(c.values));
    });
  }, []);
  if (!cfg || !draft) return <Text color="cream">{t("loading")}</Text>;

  const num = (v: string) => (v === "" ? 0 : Math.max(0, Math.floor(Number(v)) || 0));
  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const out = await adminCall<AdminConfigOut>("/admin/config", { method: "PUT", body: draft });
      setCfg(out);
      setDraft(structuredClone(out.values));
      toaster.success({ title: t("saved") });
    } catch {
      /* đã toast */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap={4} layerStyle="sticker" p={4} bg="paper" maxW="3xl">
      <Field label={t("cfg.rankedWinLead")} hint={t("cfg.rankedWinLeadHint")}>
        <Input
          type="number"
          w="32"
          value={draft.ranked_win_lead}
          onChange={(e) => setDraft({ ...draft, ranked_win_lead: num(e.target.value) })}
        />
      </Field>
      <Field label={t("cfg.mmBotAfter")} hint={t("cfg.mmBotAfterHint")}>
        <HStack>
          <Input
            type="number"
            w="32"
            value={draft.mm_bot_after_seconds ?? ""}
            placeholder={t("cfg.env")}
            onChange={(e) =>
              setDraft({
                ...draft,
                mm_bot_after_seconds: e.target.value === "" ? null : num(e.target.value),
              })
            }
          />
          <Button
            size="xs"
            variant="sticker"
            onClick={() => setDraft({ ...draft, mm_bot_after_seconds: null })}
          >
            {t("cfg.useEnv")}
          </Button>
        </HStack>
      </Field>
      <Field label={t("cfg.adsMock")} hint={t("cfg.adsMockHint")}>
        <Button
          size="sm"
          variant="sticker"
          bg={draft.ads_mock ? "sun" : "paper"}
          onClick={() => setDraft({ ...draft, ads_mock: !draft.ads_mock })}
          data-testid="cfg-ads-mock"
        >
          {draft.ads_mock ? t("cfg.adsMockOn") : t("cfg.adsMockOff")}
        </Button>
      </Field>
      <Field label={t("cfg.rarityPrice")} hint={t("cfg.rarityPriceHint")}>
        <Stack gap={1}>
          {RARITIES.map((r) => (
            <HStack key={r} gap={2}>
              <Text w="28" fontWeight="600">
                {t(`rarity.${r}`)}
              </Text>
              <Input
                type="number"
                w="28"
                value={draft.rarity_price[r]?.lead ?? ""}
                placeholder={t("lead")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    rarity_price: {
                      ...draft.rarity_price,
                      [r]: priceOf(num(e.target.value), draft.rarity_price[r]?.flower ?? 0),
                    },
                  })
                }
              />
              <Input
                type="number"
                w="28"
                value={draft.rarity_price[r]?.flower ?? ""}
                placeholder={t("flower")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    rarity_price: {
                      ...draft.rarity_price,
                      [r]: priceOf(draft.rarity_price[r]?.lead ?? 0, num(e.target.value)),
                    },
                  })
                }
              />
            </HStack>
          ))}
        </Stack>
      </Field>
      <Field label={t("cfg.checkinRewards")} hint={t("cfg.checkinRewardsHint")}>
        <SimpleGrid columns={{ base: 1, sm: 2 }} gap={1}>
          {draft.checkin_rewards.map((r, i) => (
            <HStack key={i} gap={2}>
              <Text w="16" fontWeight="600">
                {t("day", { n: String(i + 1) })}
              </Text>
              <Input
                type="number"
                w="24"
                value={r.lead ?? ""}
                placeholder={t("lead")}
                onChange={(e) => {
                  const next = draft.checkin_rewards.slice();
                  next[i] = rewardOf(num(e.target.value), r.flower ?? 0);
                  setDraft({ ...draft, checkin_rewards: next });
                }}
              />
              <Input
                type="number"
                w="24"
                value={r.flower ?? ""}
                placeholder={t("flower")}
                onChange={(e) => {
                  const next = draft.checkin_rewards.slice();
                  next[i] = rewardOf(r.lead ?? 0, num(e.target.value));
                  setDraft({ ...draft, checkin_rewards: next });
                }}
              />
            </HStack>
          ))}
        </SimpleGrid>
      </Field>
      <HStack>
        <Button variant="sticker" bg="mint" loading={busy} onClick={() => void save()}>
          <LuSave /> {t("save")}
        </Button>
        <Button variant="sticker" size="sm" onClick={() => setDraft(structuredClone(cfg.defaults))}>
          {t("cfg.resetDefaults")}
        </Button>
      </HStack>
    </Stack>
  );
}

function priceOf(lead: number, flower: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (lead > 0) out.lead = lead;
  if (flower > 0) out.flower = flower;
  return out;
}

function rewardOf(lead: number, flower: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (lead > 0) out.lead = lead;
  if (flower > 0) out.flower = flower;
  if (!Object.keys(out).length) out.lead = 0;
  return out;
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
