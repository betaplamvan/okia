"use client";

import {
  Box,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Portal,
  Slider,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { LuImagePlus, LuTrash2 } from "react-icons/lu";
import { toaster } from "@/components/ui/toaster";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";

// Đổi ảnh đại diện (ADR-0010): chọn file → cắt vuông bằng react-easy-crop → xuất JPEG 512px
// qua canvas → POST /me/avatar (server nén WebP 256px). Khách không có nút này.
export function AvatarUpload() {
  const t = useTranslations("Economy");
  const ta = useTranslations("Auth");
  const user = useAuth((s) => s.user);
  const uploadAvatar = useAuth((s) => s.uploadAvatar);
  const deleteAvatar = useAuth((s) => s.deleteAvatar);
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  if (user.isGuest) {
    return (
      <Text fontSize="sm" opacity={0.75}>
        {t("guestAvatar")}
      </Text>
    );
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }

  function close() {
    if (src) URL.revokeObjectURL(src);
    setSrc(null);
  }

  async function save() {
    if (!src || !area) return;
    setBusy(true);
    try {
      const blob = await cropToBlob(src, area);
      await uploadAvatar(blob);
      toaster.success({ title: t("avatarSaved") });
      close();
    } catch (e) {
      toaster.error({ title: e instanceof ApiError && e.message ? e.message : ta("errorGeneric") });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteAvatar();
      toaster.success({ title: t("avatarRemoved") });
    } catch (e) {
      toaster.error({ title: e instanceof ApiError && e.message ? e.message : ta("errorGeneric") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <HStack gap={2} flexWrap="wrap">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={pick}
          data-testid="avatar-input"
        />
        <Button size="sm" variant="sticker" onClick={() => inputRef.current?.click()}>
          <LuImagePlus /> {t("changeAvatar")}
        </Button>
        {user.hasCustomAvatar ? (
          <Button size="sm" variant="sticker" loading={busy} onClick={remove}>
            <LuTrash2 /> {t("removeAvatar")}
          </Button>
        ) : null}
      </HStack>

      <Dialog.Root
        placement="center"
        open={!!src}
        onOpenChange={(e) => {
          if (!e.open) close();
        }}
      >
        <Portal>
          <Dialog.Backdrop bg="rgba(26, 40, 38, 0.7)" />
          <Dialog.Positioner px={4}>
            <Dialog.Content layerStyle="sticker" p={0} overflow="hidden" maxW="sm">
              <Dialog.Header bg="sun" borderBottom="sticker" py={3}>
                <Dialog.Title fontSize="xl" fontWeight="700" color="ink">
                  {t("cropTitle")}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body color="ink" p={4}>
                <Stack gap={3}>
                  <Box
                    position="relative"
                    w="full"
                    aspectRatio="1"
                    bg="ink"
                    borderRadius="lg"
                    overflow="hidden"
                    border="2px solid"
                    borderColor="ink"
                  >
                    {src ? (
                      <Cropper
                        image={src}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        cropShape="round"
                        showGrid={false}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={(_, px) => setArea(px)}
                      />
                    ) : null}
                  </Box>
                  <Slider.Root
                    min={1}
                    max={3}
                    step={0.01}
                    value={[zoom]}
                    onValueChange={(e) => setZoom(e.value[0])}
                    {...{ "aria-label": [t("cropHint")] }}
                  >
                    <Slider.Control>
                      <Slider.Track bg="cream" border="1px solid" borderColor="ink">
                        <Slider.Range bg="mint" />
                      </Slider.Track>
                      <Slider.Thumb index={0} bg="paper" border="2px solid" borderColor="ink" />
                    </Slider.Control>
                  </Slider.Root>
                  <Text fontSize="sm" opacity={0.75}>
                    {t("cropHint")}
                  </Text>
                </Stack>
              </Dialog.Body>
              <Dialog.Footer pb={4} gap={3}>
                <Button variant="sticker" onClick={close}>
                  {ta("cancel")}
                </Button>
                <Button variant="sticker" bg="mint" loading={busy} onClick={save}>
                  {t("upload")}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" color="ink" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}

/** Cắt vùng đã chọn từ ảnh gốc ra JPEG vuông 512px (giảm dung lượng tải lên). */
async function cropToBlob(src: string, area: Area, size = 512): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image"));
    el.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/jpeg", 0.9),
  );
}
