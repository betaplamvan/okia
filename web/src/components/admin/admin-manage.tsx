"use client";

import {
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Input,
  NativeSelect,
  Portal,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuChevronLeft, LuChevronRight, LuDownload, LuSearch, LuUpload } from "react-icons/lu";
import { adminCall, Field } from "@/components/admin/admin-screen";
import { SkinPreview } from "@/components/shop/skin-preview";
import { toaster } from "@/components/ui/toaster";
import type { SkinManifest } from "@/game/skins/skins";
import type { AdminSkin, AdminUser, AdminUserDetail, AdminUserPage } from "@/lib/api";

type RarityKey = "common" | "uncommon" | "rare" | "epic" | "legendary";
const RARITIES: RarityKey[] = ["common", "uncommon", "rare", "epic", "legendary"];
const PAGE = 20;

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Người chơi ----------

type Kind = "account" | "guest" | "all";

export function AdminUsers() {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("account");
  const [page, setPage] = useState<AdminUserPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<AdminUserDetail | null>(null);
  const [lead, setLead] = useState("");
  const [flower, setFlower] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(
    (query: string, k: Kind, off: number) =>
      adminCall<AdminUserPage>("/admin/users", {
        query: { q: query, kind: k, limit: String(PAGE), offset: String(off) },
      })
        .then(setPage)
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    void load("", "account", 0);
  }, [load]);

  function search(nextKind = kind, nextOffset = 0) {
    setOffset(nextOffset);
    void load(q, nextKind, nextOffset);
  }

  async function open(id: string) {
    const d = await adminCall<AdminUserDetail>(`/admin/users/${id}`);
    setSel(d);
    setName(d.displayName);
    setLead("");
    setFlower("");
    setNote("");
  }
  async function refreshSel(u: AdminUser) {
    setPage((p) =>
      p ? { ...p, items: p.items.map((x) => (x.id === u.id ? { ...x, ...u } : x)) } : p,
    );
    await open(u.id);
  }
  async function grant() {
    if (!sel) return;
    const u = await adminCall<AdminUser>(`/admin/users/${sel.id}/grant`, {
      method: "POST",
      body: { lead: Number(lead) || 0, flower: Number(flower) || 0, note },
    });
    toaster.success({ title: t("users.granted") });
    await refreshSel(u);
  }
  async function ban(days: number | null) {
    if (!sel) return;
    const u = await adminCall<AdminUser>(`/admin/users/${sel.id}/ban`, {
      method: "POST",
      body: { days },
    });
    toaster.success({ title: days === null ? t("users.unbanned") : t("users.banned") });
    await refreshSel(u);
  }
  async function rename() {
    if (!sel) return;
    const u = await adminCall<AdminUser>(`/admin/users/${sel.id}`, {
      method: "PATCH",
      body: { displayName: name },
    });
    toaster.success({ title: t("saved") });
    await refreshSel(u);
  }

  const total = page?.total ?? 0;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + PAGE, total);

  return (
    <Stack gap={3} color="ink">
      <HStack
        as="form"
        flexWrap="wrap"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("users.searchHint")}
          bg="paper"
          maxW="sm"
        />
        <NativeSelect.Root size="md" w="56" bg="paper" borderRadius="md">
          <NativeSelect.Field
            value={kind}
            aria-label={t("users.kind")}
            onChange={(e) => {
              const k = e.target.value as Kind;
              setKind(k);
              search(k, 0);
            }}
          >
            <option value="account">{t("users.kindAccount")}</option>
            <option value="guest">{t("users.kindGuest")}</option>
            <option value="all">{t("users.kindAll")}</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Button type="submit" variant="sticker" size="sm">
          <LuSearch /> {t("users.search")}
        </Button>
        <Text color="cream" fontSize="sm" ms="auto">
          {t("users.range", { from: String(from), to: String(to), total: format.number(total) })}
        </Text>
      </HStack>
      <Stack
        direction={{ base: "column", lg: "row" }}
        gap={4}
        align="flex-start"
        data-testid="admin-users"
      >
        <Stack gap={1} flex="1" minW={0} w="full">
          {(page?.items ?? []).map((u) => (
            <Box
              key={u.id}
              asChild
              bg={sel?.id === u.id ? "mint" : "paper"}
              color="ink"
              border="2px solid"
              borderColor="ink"
              borderRadius="lg"
              px={3}
              py={2}
              textAlign="left"
              w="full"
            >
              <button type="button" onClick={() => void open(u.id)}>
                <HStack gap={3}>
                  <Stack gap={0} flex="1" minW={0}>
                    <Text fontWeight="700" truncate>
                      {u.displayName}{" "}
                      {u.isGuest ? (
                        <Badge bg="cream" color="ink">
                          {t("users.guest")}
                        </Badge>
                      ) : null}{" "}
                      {u.bannedUntil && new Date(u.bannedUntil) > new Date() ? (
                        <Badge bg="coral" color="ink">
                          {t("users.bannedBadge")}
                        </Badge>
                      ) : null}
                    </Text>
                    <Text fontSize="xs" opacity={0.7} truncate>
                      {u.email ?? u.id}
                    </Text>
                  </Stack>
                  <Text fontSize="sm" flexShrink={0}>
                    {format.number(u.lead)} ✎ · {format.number(u.flower)} ✿
                    {u.points != null ? ` · ${u.points} ${t("users.pts")}` : ""}
                  </Text>
                </HStack>
              </button>
            </Box>
          ))}
          {page && page.items.length === 0 ? <Text color="cream">{t("users.none")}</Text> : null}
          {total > PAGE ? (
            <HStack justify="center" pt={2}>
              <Button
                variant="sticker"
                size="xs"
                disabled={offset === 0}
                onClick={() => search(kind, Math.max(0, offset - PAGE))}
              >
                <LuChevronLeft /> {t("users.prev")}
              </Button>
              <Text color="cream" fontSize="sm">
                {t("users.page", {
                  n: String(Math.floor(offset / PAGE) + 1),
                  of: String(Math.ceil(total / PAGE)),
                })}
              </Text>
              <Button
                variant="sticker"
                size="xs"
                disabled={offset + PAGE >= total}
                onClick={() => search(kind, offset + PAGE)}
              >
                {t("users.next")} <LuChevronRight />
              </Button>
            </HStack>
          ) : null}
        </Stack>
        {sel ? (
          <Stack
            gap={3}
            layerStyle="sticker"
            bg="paper"
            p={4}
            w={{ base: "full", lg: "md" }}
            flexShrink={0}
            data-testid="admin-user-detail"
          >
            <Text fontWeight="700" fontSize="lg">
              {sel.displayName}
            </Text>
            <Text fontSize="xs" opacity={0.75} wordBreak="break-all">
              {sel.id}
              <br />
              {sel.email ?? "—"} · {sel.locale} ·{" "}
              {format.dateTime(new Date(sel.createdAt), { dateStyle: "short" })}
              <br />
              {sel.identities.join(", ") || "—"}
            </Text>
            <Text fontSize="sm">
              {t("users.wallet")}: {format.number(sel.lead)} ✎ · {format.number(sel.flower)} ✿
              {sel.points != null
                ? ` · ${t("users.rank")}: ${sel.points} (${sel.wins}/${sel.games}, mmr ${Math.round(sel.mmr ?? 0)})`
                : ""}
            </Text>
            <Field label={t("users.rename")}>
              <HStack>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
                <Button variant="sticker" size="sm" onClick={() => void rename()}>
                  {t("save")}
                </Button>
              </HStack>
            </Field>
            <Field label={t("users.grant")} hint={t("users.grantHint")}>
              <HStack flexWrap="wrap">
                <Input
                  type="number"
                  w="24"
                  placeholder={t("lead")}
                  value={lead}
                  onChange={(e) => setLead(e.target.value)}
                />
                <Input
                  type="number"
                  w="24"
                  placeholder={t("flower")}
                  value={flower}
                  onChange={(e) => setFlower(e.target.value)}
                />
                <Input
                  w="40"
                  placeholder={t("users.note")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button variant="sticker" size="sm" bg="sun" onClick={() => void grant()}>
                  {t("users.grantDo")}
                </Button>
              </HStack>
            </Field>
            <Field
              label={t("users.ban")}
              hint={
                sel.bannedUntil
                  ? t("users.bannedUntil", {
                      date: format.dateTime(new Date(sel.bannedUntil), { dateStyle: "medium" }),
                    })
                  : t("users.notBanned")
              }
            >
              <HStack flexWrap="wrap">
                {[1, 7, 30, 3650].map((d) => (
                  <Button
                    key={d}
                    variant="sticker"
                    size="xs"
                    bg="coral"
                    onClick={() => void ban(d)}
                  >
                    {d >= 3650 ? t("users.banForever") : t("users.banDays", { n: String(d) })}
                  </Button>
                ))}
                <Button variant="sticker" size="xs" bg="mint" onClick={() => void ban(null)}>
                  {t("users.unban")}
                </Button>
              </HStack>
            </Field>
            <Field label={t("users.matches")}>
              <Stack gap={1}>
                {sel.matches.map((m) => (
                  <Text key={m.id} fontSize="xs">
                    {format.dateTime(new Date(m.endedAt), {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}{" "}
                    · {m.mode} · {m.board} · {m.opponent ?? "?"} ·{" "}
                    {m.won === null ? "=" : m.won ? "W" : "L"} {m.scores.join("-")}
                    {m.pointsDelta != null
                      ? ` · ${m.pointsDelta > 0 ? "+" : ""}${m.pointsDelta}`
                      : ""}
                  </Text>
                ))}
                {sel.matches.length === 0 ? (
                  <Text fontSize="xs" opacity={0.7}>
                    —
                  </Text>
                ) : null}
              </Stack>
            </Field>
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  );
}

// ---------- Skin ----------

type Meta = {
  nameVi: string;
  nameEn: string;
  descVi: string;
  descEn: string;
  rarity: RarityKey;
  enabled: boolean;
  sort: number;
};

function metaOf(r: AdminSkin): Meta {
  const m = r.manifest as { description?: { vi: string; en: string } } & AdminSkin["manifest"];
  return {
    nameVi: m.name?.vi ?? "",
    nameEn: m.name?.en ?? "",
    descVi: m.description?.vi ?? "",
    descEn: m.description?.en ?? "",
    rarity: r.rarity as RarityKey,
    enabled: r.enabled,
    sort: r.sort,
  };
}

export function AdminSkins() {
  const t = useTranslations("Admin");
  const [rows, setRows] = useState<AdminSkin[]>([]);
  const [tab, setTab] = useState<"pen" | "box">("pen");
  const [editing, setEditing] = useState<{ row: AdminSkin; meta: Meta } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      adminCall<AdminSkin[]>("/admin/skins")
        .then(setRows)
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function saveMeta() {
    if (!editing) return;
    const { row, meta } = editing;
    try {
      await adminCall<AdminSkin>(`/admin/skins/${row.id}`, {
        method: "PATCH",
        body: {
          name: { vi: meta.nameVi, en: meta.nameEn },
          description: { vi: meta.descVi, en: meta.descEn },
          rarity: meta.rarity,
          enabled: meta.enabled,
          sort: meta.sort,
        },
      });
      toaster.success({ title: t("saved") });
      setEditing(null);
      await load();
    } catch {
      /* đã toast */
    }
  }
  async function remove(r: AdminSkin) {
    if (!window.confirm(t("skins.confirmDelete", { id: r.id }))) return;
    await adminCall(`/admin/skins/${r.id}`, { method: "DELETE" });
    await load();
  }
  async function toggle(r: AdminSkin) {
    await adminCall<AdminSkin>(`/admin/skins/${r.id}`, {
      method: "PATCH",
      body: { enabled: !r.enabled },
    });
    await load();
  }
  async function exportOne(r: AdminSkin) {
    const m = await adminCall<unknown>(`/admin/skins/${r.id}/export`);
    downloadJson(`${r.id}.json`, m);
  }
  async function exportAll() {
    const data = await adminCall<{ skins: unknown[] }>("/admin/skins/export");
    downloadJson(`okia-skins-${new Date().toISOString().slice(0, 10)}.json`, data);
  }
  async function importFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as
        { skins?: unknown[] } | unknown[] | { id?: string };
      // Chấp nhận: {skins:[…]} (xuất tất cả), […] hoặc một manifest đơn lẻ.
      const skins = Array.isArray(parsed)
        ? parsed
        : "skins" in parsed && Array.isArray(parsed.skins)
          ? parsed.skins
          : [parsed];
      const replace = skins.length > 1 ? window.confirm(t("skins.confirmReplace")) : false;
      await adminCall<AdminSkin[]>("/admin/skins/import", {
        method: "POST",
        body: { skins, replace },
      });
      toaster.success({ title: t("skins.imported", { n: String(skins.length) }) });
      await load();
    } catch (e) {
      toaster.error({ title: String(e) });
    }
  }

  const shown = rows.filter((r) => r.type === tab);
  return (
    <Stack gap={3} color="ink" data-testid="admin-skins">
      <HStack flexWrap="wrap">
        {(["pen", "box"] as const).map((k) => (
          <Button
            key={k}
            variant="sticker"
            size="sm"
            bg={tab === k ? "mint" : "paper"}
            onClick={() => setTab(k)}
          >
            {t(`skins.${k}`)} · {rows.filter((r) => r.type === k).length}
          </Button>
        ))}
        <Button variant="sticker" size="sm" onClick={() => void exportAll()}>
          <LuDownload /> {t("skins.export")}
        </Button>
        <Button variant="sticker" size="sm" bg="sun" onClick={() => fileRef.current?.click()}>
          <LuUpload /> {t("skins.import")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = "";
          }}
        />
        <Text color="cream" fontSize="sm" ms="auto">
          {t("skins.count", { n: String(rows.length) })}
        </Text>
      </HStack>
      <Text color="cream" fontSize="xs">
        {t("skins.editHint")}
      </Text>
      <SimpleGrid columns={{ base: 2, sm: 3, md: 4, lg: 5 }} gap={3}>
        {shown.map((r) => (
          <Stack
            key={r.id}
            gap={2}
            bg={r.enabled ? "paper" : "cream"}
            opacity={r.enabled ? 1 : 0.75}
            border="2px solid"
            borderColor="ink"
            borderRadius="lg"
            boxShadow="stickerSm"
            p={2}
            data-testid={`admin-skin-${r.id}`}
          >
            <SkinPreview skin={r.manifest as unknown as SkinManifest} />
            <Stack gap={0} minW={0}>
              <Text fontWeight="700" truncate lineHeight="1.2">
                {r.manifest.name?.vi ?? r.id}
              </Text>
              <Text fontSize="xs" opacity={0.7} truncate>
                {r.id}
              </Text>
              <Text fontSize="xs" opacity={0.85}>
                {t(`rarity.${r.rarity as RarityKey}`)} ·{" "}
                {t("skins.owners", { n: String(r.owners) })}
                {r.manifest.default ? ` · ${t("skins.default")}` : ""}
                {!r.enabled ? ` · ${t("skins.disabled")}` : ""}
              </Text>
            </Stack>
            <HStack flexWrap="wrap" gap={1}>
              <Button
                size="xs"
                variant="sticker"
                onClick={() => setEditing({ row: r, meta: metaOf(r) })}
              >
                {t("skins.edit")}
              </Button>
              <Button size="xs" variant="sticker" onClick={() => void exportOne(r)}>
                {t("skins.exportOne")}
              </Button>
              {!r.manifest.default ? (
                <>
                  <Button size="xs" variant="sticker" onClick={() => void toggle(r)}>
                    {r.enabled ? t("skins.disable") : t("skins.enable")}
                  </Button>
                  <Button size="xs" variant="sticker" bg="coral" onClick={() => void remove(r)}>
                    {t("skins.delete")}
                  </Button>
                </>
              ) : null}
            </HStack>
          </Stack>
        ))}
      </SimpleGrid>

      <Dialog.Root
        open={!!editing}
        onOpenChange={(e) => {
          if (!e.open) setEditing(null);
        }}
        size="md"
        scrollBehavior="inside"
        lazyMount
        unmountOnExit
      >
        <Portal>
          <Dialog.Backdrop bg="rgba(26, 40, 38, 0.6)" />
          <Dialog.Positioner px={4}>
            <Dialog.Content layerStyle="sticker" p={0} overflow="hidden">
              <Dialog.Header bg="sun" borderBottom="sticker" py={3}>
                <Dialog.Title fontWeight="700" color="ink">
                  {editing ? t("skins.editTitle", { id: editing.row.id }) : ""}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body color="ink" py={4}>
                {editing ? (
                  <Stack gap={3}>
                    <HStack align="flex-start">
                      <Box w="96px" flexShrink={0}>
                        <SkinPreview skin={editing.row.manifest as unknown as SkinManifest} />
                      </Box>
                      <Text fontSize="xs" opacity={0.75}>
                        {t("skins.metaOnlyHint")}
                      </Text>
                    </HStack>
                    <MetaField
                      label={t("skins.nameVi")}
                      value={editing.meta.nameVi}
                      onChange={(v) =>
                        setEditing({ ...editing, meta: { ...editing.meta, nameVi: v } })
                      }
                    />
                    <MetaField
                      label={t("skins.nameEn")}
                      value={editing.meta.nameEn}
                      onChange={(v) =>
                        setEditing({ ...editing, meta: { ...editing.meta, nameEn: v } })
                      }
                    />
                    <MetaField
                      label={t("skins.descVi")}
                      value={editing.meta.descVi}
                      multiline
                      onChange={(v) =>
                        setEditing({ ...editing, meta: { ...editing.meta, descVi: v } })
                      }
                    />
                    <MetaField
                      label={t("skins.descEn")}
                      value={editing.meta.descEn}
                      multiline
                      onChange={(v) =>
                        setEditing({ ...editing, meta: { ...editing.meta, descEn: v } })
                      }
                    />
                    <HStack gap={3} flexWrap="wrap">
                      <Field label={t("skins.rarity")}>
                        <NativeSelect.Root size="sm" w="40">
                          <NativeSelect.Field
                            value={editing.meta.rarity}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                meta: { ...editing.meta, rarity: e.target.value as RarityKey },
                              })
                            }
                          >
                            {RARITIES.map((r) => (
                              <option key={r} value={r}>
                                {t(`rarity.${r}`)}
                              </option>
                            ))}
                          </NativeSelect.Field>
                          <NativeSelect.Indicator />
                        </NativeSelect.Root>
                      </Field>
                      <Field label={t("skins.sort")}>
                        <Input
                          type="number"
                          w="24"
                          size="sm"
                          value={editing.meta.sort}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              meta: { ...editing.meta, sort: Number(e.target.value) || 0 },
                            })
                          }
                        />
                      </Field>
                      {!editing.row.manifest.default ? (
                        <Field label={t("skins.enabledLabel")}>
                          <Button
                            size="sm"
                            variant="sticker"
                            bg={editing.meta.enabled ? "mint" : "cream"}
                            onClick={() =>
                              setEditing({
                                ...editing,
                                meta: { ...editing.meta, enabled: !editing.meta.enabled },
                              })
                            }
                          >
                            {editing.meta.enabled ? t("skins.enabledOn") : t("skins.enabledOff")}
                          </Button>
                        </Field>
                      ) : null}
                    </HStack>
                    <HStack>
                      <Button variant="sticker" bg="mint" onClick={() => void saveMeta()}>
                        {t("save")}
                      </Button>
                      <Button variant="sticker" size="sm" onClick={() => setEditing(null)}>
                        {t("cancel")}
                      </Button>
                    </HStack>
                  </Stack>
                ) : null}
              </Dialog.Body>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" bg="paper" border="sticker" borderRadius="full" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Stack>
  );
}

function MetaField({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <Field label={label}>
      {multiline ? (
        <Textarea value={value} rows={2} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={value} maxLength={48} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}
