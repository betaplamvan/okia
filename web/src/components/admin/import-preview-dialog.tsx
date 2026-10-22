"use client";

import {
  Badge,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Portal,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LuUpload } from "react-icons/lu";
import { SkinCardPreview } from "@/components/admin/skin-card-preview";
import { TryDialog } from "@/components/shop/try-dialog";
import type { SkinManifest } from "@/game/skins/skins";

/** Một skin trong gói sắp nhập: manifest (ảnh / tiếng trỏ blob: URL cục bộ qua `assets.urls`). */
export type PreviewItem = {
  manifest: SkinManifest;
  files: { path: string; size: number }[];
  exists: boolean;
  replacesDefault: boolean;
};

type Props = {
  items: PreviewItem[] | null;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

const kb = (n: number) => `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;

// Xem trước gói trước khi nhập (ADR-0014): thẻ đúng như trong shop, file đi kèm, skin nào đã có
// (sẽ ghi đè), "Thử" mở bàn mẫu thật với ảnh / tiếng ngay từ zip — chưa ghi gì lên máy chủ.
export function ImportPreviewDialog({ items, busy, onConfirm, onClose }: Props) {
  const t = useTranslations("Admin");
  const [trying, setTrying] = useState<SkinManifest | null>(null);
  return (
    <>
      <Dialog.Root
        open={!!items}
        onOpenChange={(e) => {
          if (!e.open) onClose();
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
                  {t("skins.previewTitle", { n: String(items?.length ?? 0) })}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body color="ink" py={4} data-testid="import-preview">
                <Stack gap={4}>
                  <Text fontSize="sm" opacity={0.8}>
                    {t("skins.previewHint")}
                  </Text>
                  <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} gap={4}>
                    {(items ?? []).map((it) => (
                      <Stack key={it.manifest.id} gap={2}>
                        <SkinCardPreview
                          skin={it.manifest}
                          testId={`preview-skin-${it.manifest.id}`}
                          onTry={() => setTrying(it.manifest)}
                          badges={
                            <HStack gap={1} flexWrap="wrap">
                              <Badge
                                bg={it.replacesDefault ? "coral" : it.exists ? "sun" : "mint"}
                                color="ink"
                                border="2px solid"
                                borderColor="ink"
                              >
                                {it.replacesDefault
                                  ? t("skins.previewDefault")
                                  : it.exists
                                    ? t("skins.previewExists")
                                    : t("skins.previewNew")}
                              </Badge>
                              <Badge bg="paper" color="ink" border="2px solid" borderColor="ink">
                                {it.manifest.id}
                              </Badge>
                            </HStack>
                          }
                        />
                        <Stack gap={0} fontSize="xs" fontFamily="mono" opacity={0.85}>
                          {it.files.length === 0 ? (
                            <Text>{t("skins.previewNoFiles")}</Text>
                          ) : (
                            it.files.map((f) => (
                              <Text key={f.path}>
                                {f.path} · {kb(f.size)}
                              </Text>
                            ))
                          )}
                        </Stack>
                      </Stack>
                    ))}
                  </SimpleGrid>
                  <HStack>
                    <Button
                      variant="sticker"
                      bg="mint"
                      onClick={onConfirm}
                      loading={busy}
                      data-sfx="confirm"
                      data-testid="import-confirm"
                    >
                      <LuUpload /> {t("skins.previewImport", { n: String(items?.length ?? 0) })}
                    </Button>
                    <Button variant="sticker" size="sm" onClick={onClose} data-sfx="back">
                      {t("cancel")}
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
      <TryDialog skin={trying} onClose={() => setTrying(null)} />
    </>
  );
}
