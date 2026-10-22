"use client";

import { Badge, Button, HStack, Input, Stack, Table, Text } from "@chakra-ui/react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { adminCall } from "@/components/admin/admin-screen";
import { toaster } from "@/components/ui/toaster";
import type { AdminDonation, AdminDonationPage } from "@/lib/api";

const PAGE = 50;

// Tab Ủng hộ (docs/10 — Donate): mọi giao dịch từ webhook (số tiền chỉ admin thấy), đặt tên hiện
// trên bảng cảm ơn cho giao dịch không ghi tên, ẩn / hiện từng dòng.
export function AdminDonations() {
  const t = useTranslations("Admin");
  const f = useFormatter();
  const [page, setPage] = useState<AdminDonationPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(
    (off = offset) =>
      adminCall<AdminDonationPage>("/admin/donations", {
        query: { limit: String(PAGE), offset: String(off) },
      })
        .then(setPage)
        .catch(() => {}),
    [offset],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function patch(d: AdminDonation, body: { donorName?: string; hidden?: boolean }) {
    await adminCall<AdminDonation>(`/admin/donations/${d.id}`, { method: "PATCH", body });
    toaster.success({ title: t("saved") });
    setEditing(null);
    await load();
  }
  const money = (d: AdminDonation) =>
    d.currency === "VND"
      ? `${f.number(d.amount)}đ`
      : `${f.number(d.amount / 100, { minimumFractionDigits: 2 })} ${d.currency}`;

  return (
    <Stack gap={3} color="ink" data-testid="admin-donations">
      <HStack flexWrap="wrap" gap={3}>
        <Text fontWeight="700" color="cream">
          {t("donations.summary", {
            n: String(page?.total ?? 0),
            sum: f.number(page?.sumVnd ?? 0),
          })}
        </Text>
        <Text color="cream" fontSize="sm" ms="auto">
          {page
            ? `${Math.min(offset + 1, page.total)}–${Math.min(offset + PAGE, page.total)} / ${page.total}`
            : ""}
        </Text>
        <Button
          size="xs"
          variant="sticker"
          disabled={offset === 0}
          onClick={() => {
            setOffset(Math.max(0, offset - PAGE));
          }}
        >
          ‹
        </Button>
        <Button
          size="xs"
          variant="sticker"
          disabled={!page || offset + PAGE >= page.total}
          onClick={() => {
            setOffset(offset + PAGE);
          }}
        >
          ›
        </Button>
      </HStack>
      <Text color="cream" fontSize="xs">
        {t("donations.hint")}
      </Text>
      <Table.Root size="sm" bg="paper" border="2px solid" borderColor="ink" borderRadius="lg">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>{t("donations.time")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("donations.source")}</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">{t("donations.amount")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("donations.content")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("donations.name")}</Table.ColumnHeader>
            <Table.ColumnHeader />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {(page?.items ?? []).map((d) => (
            <Table.Row key={d.id} opacity={d.hidden ? 0.5 : 1} data-testid={`donation-${d.id}`}>
              <Table.Cell whiteSpace="nowrap" fontSize="xs">
                {f.dateTime(new Date(d.receivedAt), { dateStyle: "short", timeStyle: "short" })}
              </Table.Cell>
              <Table.Cell fontSize="xs">{d.provider}</Table.Cell>
              <Table.Cell textAlign="end" fontWeight="700" whiteSpace="nowrap">
                {money(d)}
              </Table.Cell>
              <Table.Cell fontSize="xs" maxW="260px" truncate title={d.content}>
                {d.content}
              </Table.Cell>
              <Table.Cell>
                {editing?.id === d.id ? (
                  <HStack gap={1}>
                    <Input
                      size="xs"
                      value={editing.name}
                      maxLength={24}
                      onChange={(e) => setEditing({ id: d.id, name: e.target.value })}
                      bg="paper"
                      border="sticker"
                    />
                    <Button
                      size="xs"
                      variant="sticker"
                      bg="mint"
                      onClick={() => void patch(d, { donorName: editing.name })}
                    >
                      {t("save")}
                    </Button>
                  </HStack>
                ) : (
                  <HStack gap={1}>
                    {d.donorName ? (
                      <Badge bg="sun" color="ink" border="2px solid" borderColor="ink">
                        {d.donorName}
                      </Badge>
                    ) : (
                      <Text fontSize="xs" opacity={0.6}>
                        {t("donations.anonymous")}
                      </Text>
                    )}
                    {d.userId ? (
                      <Badge bg="mint" color="ink">
                        {t("donations.linked")}
                      </Badge>
                    ) : null}
                    <Button
                      size="xs"
                      variant="sticker"
                      onClick={() => setEditing({ id: d.id, name: d.donorName ?? "" })}
                    >
                      {t("donations.rename")}
                    </Button>
                  </HStack>
                )}
              </Table.Cell>
              <Table.Cell>
                <Button
                  size="xs"
                  variant="sticker"
                  bg={d.hidden ? "mint" : "coral"}
                  onClick={() => void patch(d, { hidden: !d.hidden })}
                >
                  {d.hidden ? t("donations.show") : t("donations.hide")}
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Stack>
  );
}
