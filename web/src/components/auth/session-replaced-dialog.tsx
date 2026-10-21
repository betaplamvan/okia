"use client";

import { Button, Dialog, Portal, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuMonitorSmartphone } from "react-icons/lu";
import { GoogleButton } from "@/components/auth/account-tab";
import { useAuth } from "@/stores/auth";

// Một phiên mỗi tài khoản (docs/13): tài khoản vừa đăng nhập nơi khác → phiên ở đây đã về khách.
// Báo cho người dùng; "Đăng nhập lại" chiếm lại phiên (nơi kia sẽ nhận đúng thông báo này).
export function SessionReplacedDialog() {
  const t = useTranslations("Auth");
  const open = useAuth((s) => s.sessionReplaced);
  const dismiss = useAuth((s) => s.dismissSessionReplaced);

  return (
    <Dialog.Root
      role="alertdialog"
      placement="center"
      motionPreset="slide-in-bottom"
      open={open}
      lazyMount
      unmountOnExit
      onOpenChange={(e) => {
        if (!e.open) dismiss();
      }}
    >
      <Portal>
        <Dialog.Backdrop bg="rgba(26, 40, 38, 0.6)" />
        <Dialog.Positioner px={4}>
          <Dialog.Content
            layerStyle="sticker"
            p={0}
            overflow="hidden"
            data-testid="session-replaced-dialog"
          >
            <Dialog.Header bg="pink" borderBottom="sticker" py={4}>
              <Dialog.Title
                fontSize="xl"
                fontWeight="700"
                color="ink"
                display="flex"
                alignItems="center"
                gap={2}
              >
                <LuMonitorSmartphone /> {t("replacedTitle")}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body color="ink" py={5}>
              <Stack gap={4}>
                <Text>{t("replacedBody")}</Text>
                <GoogleButton label={t("replacedLogin")} />
                <Text fontSize="sm" opacity={0.75}>
                  {t("replacedHint")}
                </Text>
                <Button variant="plain" color="ink" size="sm" onClick={dismiss}>
                  {t("replacedDismiss")}
                </Button>
              </Stack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
