"use client";

import {
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Input,
  Portal,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuDownload, LuPlus, LuSearch, LuUpload } from "react-icons/lu";
import { adminCall, Field } from "@/components/admin/admin-screen";
import { SkinPreview } from "@/components/shop/skin-preview";
import { toaster } from "@/components/ui/toaster";
import type { SkinManifest } from "@/game/skins/skins";
import type { AdminSkin, AdminUser, AdminUserDetail } from "@/lib/api";

type RarityKey = "common" | "uncommon" | "rare" | "epic" | "legendary";

// ---------- Người chơi ----------

export function AdminUsers() {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const [q, setQ] = useState("");
  const [list, setList] = useState<AdminUser[]>([]);
  const [sel, setSel] = useState<AdminUserDetail | null>(null);
  const [lead, setLead] = useState("");
  const [flower, setFlower] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");

  const search = useCallback(async (query: string) => {
    const rows = await adminCall<AdminUser[]>("/admin/users", { query: { q: query, limit: "30" } });
    setList(rows);
  }, []);
  useEffect(() => {
    adminCall<AdminUser[]>("/admin/users", { query: { q: "", limit: "30" } })
      .then(setList)
      .catch(() => {});
  }, []);

  async function open(id: string) {
    const d = await adminCall<AdminUserDetail>(`/admin/users/${id}`);
    setSel(d);
    setName(d.displayName);
    setLead("");
    setFlower("");
    setNote("");
  }
  async function refreshSel(u: AdminUser) {
    setList((l) => l.map((x) => (x.id === u.id ? { ...x, ...u } : x)));
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

  return (
    <Stack gap={3}>
      <HStack as="form" onSubmit={(e) => (e.preventDefault(), void search(q))}>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("users.searchHint")}
          bg="paper"
          maxW="md"
        />
        <Button type="submit" variant="sticker" size="sm">
          <LuSearch /> {t("users.search")}
        </Button>
      </HStack>
      <Stack
        direction={{ base: "column", lg: "row" }}
        gap={4}
        align="flex-start"
        data-testid="admin-users"
      >
        <Stack gap={1} flex="1" minW={0} w="full">
          {list.map((u) => (
            <HStack
              key={u.id}
              as="button"
              onClick={() => void open(u.id)}
              bg={sel?.id === u.id ? "mint" : "paper"}
              border="2px solid"
              borderColor="ink"
              borderRadius="lg"
              px={3}
              py={2}
              gap={3}
              textAlign="left"
              w="full"
            >
              <Stack gap={0} flex="1" minW={0}>
                <Text fontWeight="700" truncate>
                  {u.displayName} {u.isGuest ? <Badge>{t("users.guest")}</Badge> : null}{" "}
                  {u.bannedUntil && new Date(u.bannedUntil) > new Date() ? (
                    <Badge colorPalette="red">{t("users.bannedBadge")}</Badge>
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
          ))}
          {list.length === 0 ? <Text color="cream">{t("users.none")}</Text> : null}
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

export function AdminSkins() {
  const t = useTranslations("Admin");
  const [rows, setRows] = useState<AdminSkin[]>([]);
  const [editing, setEditing] = useState<{
    id: string | null;
    text: string;
    enabled: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => setRows(await adminCall<AdminSkin[]>("/admin/skins")), []);
  useEffect(() => {
    adminCall<AdminSkin[]>("/admin/skins")
      .then(setRows)
      .catch(() => {});
  }, []);

  function startNew() {
    const sample: Partial<SkinManifest> = {
      id: "pen_moi",
      type: "pen",
      rarity: "common",
      name: { vi: "Bút mới", en: "New pen" },
      description: { vi: "…", en: "…" },
      default: false,
    };
    setEditing({ id: null, text: JSON.stringify(sample, null, 2), enabled: true });
    setError(null);
  }
  function startEdit(r: AdminSkin) {
    setEditing({ id: r.id, text: JSON.stringify(r.manifest, null, 2), enabled: r.enabled });
    setError(null);
  }
  async function save() {
    if (!editing) return;
    let manifest: { id?: string };
    try {
      manifest = JSON.parse(editing.text) as { id?: string };
    } catch (e) {
      setError(String(e));
      return;
    }
    const id = manifest.id ?? editing.id;
    if (!id) {
      setError(t("skins.needId"));
      return;
    }
    try {
      await adminCall<AdminSkin>(`/admin/skins/${id}`, {
        method: "PUT",
        body: { manifest, enabled: editing.enabled },
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
      method: "PUT",
      body: { manifest: r.manifest, enabled: !r.enabled },
    });
    await load();
  }
  async function exportAll() {
    const data = await adminCall<{ skins: unknown[] }>("/admin/skins/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `okia-skins-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as { skins?: unknown[] } | unknown[];
      const skins = Array.isArray(parsed) ? parsed : (parsed.skins ?? []);
      const replace = window.confirm(t("skins.confirmReplace"));
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

  return (
    <Stack gap={3} data-testid="admin-skins">
      <HStack flexWrap="wrap">
        <Button variant="sticker" size="sm" bg="mint" onClick={startNew}>
          <LuPlus /> {t("skins.add")}
        </Button>
        <Button variant="sticker" size="sm" onClick={() => void exportAll()}>
          <LuDownload /> {t("skins.export")}
        </Button>
        <Button variant="sticker" size="sm" onClick={() => fileRef.current?.click()}>
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
        <Text color="cream" fontSize="sm">
          {t("skins.count", { n: String(rows.length) })}
        </Text>
      </HStack>
      <Stack gap={1}>
        {rows.map((r) => (
          <HStack
            key={r.id}
            bg={r.enabled ? "paper" : "cream"}
            opacity={r.enabled ? 1 : 0.7}
            border="2px solid"
            borderColor="ink"
            borderRadius="lg"
            px={3}
            py={2}
            gap={3}
          >
            <Box w="48px" flexShrink={0}>
              <SkinPreview skin={r.manifest as unknown as SkinManifest} />
            </Box>
            <Stack gap={0} flex="1" minW={0}>
              <Text fontWeight="700" truncate>
                {r.manifest.name?.vi ?? r.id}{" "}
                <Text as="span" fontSize="xs" opacity={0.7}>
                  {r.id}
                </Text>
              </Text>
              <Text fontSize="xs" opacity={0.8}>
                {r.type} · {t(`rarity.${r.rarity as RarityKey}`)} ·{" "}
                {t("skins.owners", { n: String(r.owners) })}
                {r.manifest.default ? ` · ${t("skins.default")}` : ""}
                {!r.enabled ? ` · ${t("skins.disabled")}` : ""}
              </Text>
            </Stack>
            <HStack flexShrink={0}>
              <Button size="xs" variant="sticker" onClick={() => startEdit(r)}>
                {t("skins.edit")}
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
          </HStack>
        ))}
      </Stack>

      <Dialog.Root
        open={!!editing}
        onOpenChange={(e) => {
          if (!e.open) setEditing(null);
        }}
        size="xl"
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
                  {editing?.id ? t("skins.editTitle", { id: editing.id }) : t("skins.add")}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body color="ink" py={4}>
                <Stack gap={3}>
                  <Text fontSize="xs" opacity={0.75}>
                    {t("skins.editHint")}
                  </Text>
                  <Textarea
                    fontFamily="mono"
                    fontSize="xs"
                    minH="60vh"
                    value={editing?.text ?? ""}
                    onChange={(e) =>
                      setEditing((cur) => (cur ? { ...cur, text: e.target.value } : cur))
                    }
                  />
                  {error ? (
                    <Text color="coral" fontSize="sm">
                      {error}
                    </Text>
                  ) : null}
                  <HStack>
                    <Button variant="sticker" bg="mint" onClick={() => void save()}>
                      {t("save")}
                    </Button>
                    <Button
                      variant="sticker"
                      size="sm"
                      onClick={() =>
                        setEditing((cur) => (cur ? { ...cur, enabled: !cur.enabled } : cur))
                      }
                    >
                      {editing?.enabled ? t("skins.enabledOn") : t("skins.enabledOff")}
                    </Button>
                  </HStack>
                </Stack>
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
