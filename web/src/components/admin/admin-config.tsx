"use client";

import { Button, HStack, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LuRotateCcw, LuSave } from "react-icons/lu";
import { adminCall, Field } from "@/components/admin/admin-screen";
import { toaster } from "@/components/ui/toaster";
import { type AdminConfigOut, type AdminConfigValues, ApiError } from "@/lib/api";

/**
 * Tab Thông số (docs/06 — Thông số chỉnh ở admin, docs/13 — Admin): mỗi thông số hiện **giá trị
 * hiện tại** và **mặc định** cạnh ô nhập giá trị mới; Lưu chỉ gửi các khóa đã đổi so với giá trị
 * đang có trên server (`PUT /admin/config`). Ô để trống = giữ nguyên.
 */

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;

type IntKey = {
  [K in keyof AdminConfigValues]: AdminConfigValues[K] extends number ? K : never;
}[keyof AdminConfigValues];
type BoolKey = {
  [K in keyof AdminConfigValues]: AdminConfigValues[K] extends boolean ? K : never;
}[keyof AdminConfigValues];

type Group = "ranked" | "chat" | "ads" | "account";

/** Nhóm → các thông số số nguyên đơn (thứ tự hiển thị). Khoảng cho phép trùng api/app/admin/config.py. */
const INT_GROUPS: { group: Group; keys: { key: IntKey; min: number; max: number }[] }[] = [
  {
    group: "ranked",
    keys: [
      { key: "ranked_win_lead", min: 0, max: 10_000 },
      { key: "ranked_turn_seconds", min: 10, max: 120 },
      { key: "mm_accept_seconds", min: 5, max: 60 },
      { key: "mm_rematch_grace_seconds", min: 0, max: 120 },
      { key: "mm_unlimited_after_seconds", min: 0, max: 600 },
      { key: "disconnect_grace_seconds", min: 10, max: 300 },
    ],
  },
  {
    group: "chat",
    keys: [
      { key: "chat_max_len", min: 20, max: 2000 },
      { key: "chat_min_interval_seconds", min: 0, max: 60 },
      { key: "chat_per_minute", min: 1, max: 120 },
      { key: "chat_dup_seconds", min: 0, max: 600 },
    ],
  },
  { group: "ads", keys: [{ key: "ads_interstitial_every", min: 0, max: 50 }] },
  { group: "account", keys: [{ key: "guest_per_ip_per_hour", min: 1, max: 1000 }] },
];
const BOOL_OF_GROUP: Partial<Record<Group, BoolKey[]>> = {
  chat: ["chat_enabled"],
  ads: ["ads_mock"],
};

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Các khóa trong `draft` khác `base`. */
function changedKeys(
  draft: AdminConfigValues,
  base: AdminConfigValues,
): Partial<AdminConfigValues> {
  const out: Partial<AdminConfigValues> = {};
  for (const k of Object.keys(draft) as (keyof AdminConfigValues)[]) {
    if (!sameJson(draft[k], base[k])) (out as Record<string, unknown>)[k] = draft[k];
  }
  return out;
}

export function ConfigTab() {
  const t = useTranslations("Admin");
  const [cfg, setCfg] = useState<AdminConfigOut | null>(null);
  const [draft, setDraft] = useState<AdminConfigValues | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminCall<AdminConfigOut>("/admin/config")
      .then((c) => {
        setCfg(c);
        setDraft(structuredClone(c.values));
      })
      .catch((e: unknown) => {
        if (!(e instanceof ApiError)) toaster.error({ title: String(e) }); // ApiError đã toast
      });
  }, []);

  if (!cfg || !draft) return <Text color="cream">{t("loading")}</Text>;
  const changes = changedKeys(draft, cfg.values);
  const nChanges = Object.keys(changes).length;
  // Ngoài khoảng cho phép → tô đỏ, khóa Lưu (không kẹp giá trị lúc gõ: gõ "2" của "25" mà bị ép
  // thành 5 thì thành 55).
  const invalid = new Set<string>();
  for (const { keys } of INT_GROUPS)
    for (const { key, min, max } of keys)
      if (draft[key] < min || draft[key] > max) invalid.add(key);
  if (draft.mm_bot_after_seconds !== null && draft.mm_bot_after_seconds > 3600)
    invalid.add("mm_bot_after_seconds");

  const patch = (p: Partial<AdminConfigValues>) => setDraft({ ...draft, ...p });

  async function save() {
    if (!draft || !cfg) return;
    const body = changedKeys(draft, cfg.values);
    if (!Object.keys(body).length || invalid.size) return;
    setBusy(true);
    try {
      const out = await adminCall<AdminConfigOut>("/admin/config", { method: "PUT", body });
      setCfg(out);
      setDraft(structuredClone(out.values));
      toaster.success({ title: t("saved") });
    } catch (e) {
      if (!(e instanceof ApiError)) toaster.error({ title: String(e) }); // ApiError đã toast
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap={5} layerStyle="sticker" p={{ base: 4, md: 5 }} bg="paper" maxW="3xl">
      <Text fontSize="sm" opacity={0.75}>
        {t("cfg.intro")}
      </Text>

      {INT_GROUPS.map(({ group, keys }) => (
        <Stack key={group} gap={3}>
          <Text
            fontWeight="700"
            fontSize="lg"
            borderBottom="2px solid"
            borderColor="ink"
            pb={1}
            data-testid={`cfg-group-${group}`}
          >
            {t(`cfg.group.${group}`)}
          </Text>
          {group === "ranked" ? <BotAfterRow draft={draft} cfg={cfg} patch={patch} /> : null}
          {(BOOL_OF_GROUP[group] ?? []).map((key) => (
            <BoolRow key={key} k={key} draft={draft} cfg={cfg} patch={patch} />
          ))}
          {keys.map(({ key, min, max }) => (
            <IntRow
              key={key}
              k={key}
              min={min}
              max={max}
              invalid={invalid.has(key)}
              draft={draft}
              cfg={cfg}
              patch={patch}
            />
          ))}
        </Stack>
      ))}

      <Stack gap={3}>
        <Text fontWeight="700" fontSize="lg" borderBottom="2px solid" borderColor="ink" pb={1}>
          {t("cfg.group.economy")}
        </Text>
        <Field label={t("cfg.rarityPrice")} hint={t("cfg.rarityPriceHint")}>
          <SimpleGrid columns={1} gap={2}>
            {RARITIES.map((r) => {
              const cur = cfg.values.rarity_price[r] ?? {};
              const d = draft.rarity_price[r] ?? {};
              return (
                <HStack key={r} gap={2} align="center" flexWrap="wrap">
                  <Text w="20" fontWeight="600">
                    {t(`rarity.${r}`)}
                  </Text>
                  <Text fontSize="xs" opacity={0.7} w="24">
                    {t("cfg.current")}: {cur.lead ?? 0}/{cur.flower ?? 0}
                  </Text>
                  <Input
                    type="number"
                    w="24"
                    size="sm"
                    value={d.lead ?? ""}
                    placeholder={t("lead")}
                    onChange={(e) =>
                      patch({
                        rarity_price: {
                          ...draft.rarity_price,
                          [r]: priceOf(num(e.target.value), d.flower ?? 0),
                        },
                      })
                    }
                  />
                  <Input
                    type="number"
                    w="24"
                    size="sm"
                    value={d.flower ?? ""}
                    placeholder={t("flower")}
                    onChange={(e) =>
                      patch({
                        rarity_price: {
                          ...draft.rarity_price,
                          [r]: priceOf(d.lead ?? 0, num(e.target.value)),
                        },
                      })
                    }
                  />
                </HStack>
              );
            })}
          </SimpleGrid>
        </Field>
        <Field label={t("cfg.checkinRewards")} hint={t("cfg.checkinRewardsHint")}>
          <SimpleGrid columns={{ base: 1, sm: 2 }} gap={2}>
            {draft.checkin_rewards.map((r, i) => {
              const cur = cfg.values.checkin_rewards[i] ?? {};
              return (
                <HStack key={i} gap={2} align="center" flexWrap="wrap">
                  <Text w="14" fontWeight="600">
                    {t("day", { n: String(i + 1) })}
                  </Text>
                  <Text fontSize="xs" opacity={0.7} w="24">
                    {t("cfg.current")}: {cur.lead ?? 0}/{cur.flower ?? 0}
                  </Text>
                  <Input
                    type="number"
                    w="20"
                    size="sm"
                    value={r.lead ?? ""}
                    placeholder={t("lead")}
                    onChange={(e) => {
                      const next = draft.checkin_rewards.slice();
                      next[i] = rewardOf(num(e.target.value), r.flower ?? 0);
                      patch({ checkin_rewards: next });
                    }}
                  />
                  <Input
                    type="number"
                    w="20"
                    size="sm"
                    value={r.flower ?? ""}
                    placeholder={t("flower")}
                    onChange={(e) => {
                      const next = draft.checkin_rewards.slice();
                      next[i] = rewardOf(r.lead ?? 0, num(e.target.value));
                      patch({ checkin_rewards: next });
                    }}
                  />
                </HStack>
              );
            })}
          </SimpleGrid>
        </Field>
      </Stack>

      <HStack
        position="sticky"
        bottom={2}
        bg="paper"
        py={2}
        gap={3}
        flexWrap="wrap"
        borderTop="2px solid"
        borderColor="ink"
      >
        <Button
          variant="sticker"
          bg="mint"
          loading={busy}
          disabled={nChanges === 0 || invalid.size > 0}
          onClick={() => void save()}
          data-testid="cfg-save"
        >
          <LuSave /> {t("save")}
          {nChanges ? ` (${nChanges})` : ""}
        </Button>
        <Button
          variant="sticker"
          size="sm"
          disabled={nChanges === 0}
          onClick={() => setDraft(structuredClone(cfg.values))}
        >
          <LuRotateCcw /> {t("cfg.discard")}
        </Button>
        <Button variant="sticker" size="sm" onClick={() => setDraft(structuredClone(cfg.defaults))}>
          {t("cfg.resetDefaults")}
        </Button>
        {invalid.size ? (
          <Text fontSize="xs" color="coral" fontWeight="700">
            {t("cfg.invalid", { n: String(invalid.size) })}
          </Text>
        ) : null}
      </HStack>
    </Stack>
  );
}

type RowProps = {
  draft: AdminConfigValues;
  cfg: AdminConfigOut;
  patch: (p: Partial<AdminConfigValues>) => void;
};

/** Giá trị hiện tại (đang có trên server) · mặc định — để admin không nhập nhầm. */
function CurrentLine({
  current,
  fallback,
  testId,
}: {
  current: string;
  fallback: string;
  testId?: string;
}) {
  const t = useTranslations("Admin");
  return (
    <HStack gap={3} fontSize="xs" opacity={0.75} flexWrap="wrap">
      <Text>
        {t("cfg.current")}: <b data-testid={testId}>{current}</b>
      </Text>
      <Text>
        {t("cfg.default")}: {fallback}
      </Text>
    </HStack>
  );
}

function IntRow({
  k,
  min,
  max,
  invalid,
  draft,
  cfg,
  patch,
}: RowProps & { k: IntKey; min: number; max: number; invalid: boolean }) {
  const t = useTranslations("Admin");
  const current = cfg.values[k];
  const value = draft[k];
  const changed = value !== current;
  return (
    <Field label={t(`cfg.${k}`)} hint={t(`cfg.${k}_hint`)}>
      <CurrentLine
        current={String(current)}
        fallback={String(cfg.defaults[k])}
        testId={`cfg-current-${k}`}
      />
      <HStack gap={2}>
        <Input
          type="number"
          w="36"
          min={min}
          max={max}
          value={value}
          bg={changed ? "sun" : undefined}
          borderColor={invalid ? "coral" : undefined}
          aria-invalid={invalid || undefined}
          aria-label={t("cfg.newValue")}
          onChange={(e) => patch({ [k]: num(e.target.value) } as Partial<AdminConfigValues>)}
          data-testid={`cfg-${k}`}
        />
        <Text fontSize="xs" opacity={0.6}>
          {min}–{max}
        </Text>
      </HStack>
    </Field>
  );
}

function BoolRow({ k, draft, cfg, patch }: RowProps & { k: BoolKey }) {
  const t = useTranslations("Admin");
  const current = cfg.values[k];
  const value = draft[k];
  return (
    <Field label={t(`cfg.${k}`)} hint={t(`cfg.${k}_hint`)}>
      <CurrentLine
        current={current ? t("cfg.on") : t("cfg.off")}
        fallback={cfg.defaults[k] ? t("cfg.on") : t("cfg.off")}
      />
      <Button
        variant="sticker"
        size="sm"
        bg={value ? "sun" : "paper"}
        alignSelf="flex-start"
        onClick={() => patch({ [k]: !value } as Partial<AdminConfigValues>)}
        data-testid={`cfg-${k === "ads_mock" ? "ads-mock" : k}`}
      >
        {value ? t("cfg.onClick") : t("cfg.offClick")}
      </Button>
    </Field>
  );
}

/** Ghép máy sau N giây: null = theo biến môi trường (hiện riêng vì có trạng thái "theo env"). */
function BotAfterRow({ draft, cfg, patch }: RowProps) {
  const t = useTranslations("Admin");
  const show = (v: number | null) => (v === null ? t("cfg.env") : String(v));
  return (
    <Field label={t("cfg.mmBotAfter")} hint={t("cfg.mmBotAfterHint")}>
      <CurrentLine
        current={show(cfg.values.mm_bot_after_seconds)}
        fallback={show(cfg.defaults.mm_bot_after_seconds)}
        testId="cfg-current-mm_bot_after_seconds"
      />
      <HStack gap={2}>
        <Input
          type="number"
          w="36"
          min={0}
          max={3600}
          value={draft.mm_bot_after_seconds ?? ""}
          placeholder={t("cfg.env")}
          bg={draft.mm_bot_after_seconds !== cfg.values.mm_bot_after_seconds ? "sun" : undefined}
          onChange={(e) =>
            patch({
              mm_bot_after_seconds: e.target.value === "" ? null : num(e.target.value),
            })
          }
          data-testid="cfg-mm_bot_after_seconds"
        />
        <Button variant="sticker" size="sm" onClick={() => patch({ mm_bot_after_seconds: null })}>
          {t("cfg.useEnv")}
        </Button>
      </HStack>
    </Field>
  );
}

function num(v: string): number {
  return v === "" ? 0 : Math.max(0, Math.floor(Number(v)) || 0);
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
