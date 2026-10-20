"use client";

import {
  Box,
  Button,
  CloseButton,
  Dialog,
  IconButton,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuBookOpen } from "react-icons/lu";

// Hộp thoại "Luật chơi trong 30 giây", mở từ nút tròn trên trang chủ.
export function RulesDialog() {
  const t = useTranslations("Rules");
  const tc = useTranslations("Common");
  const steps = ["step1", "step2", "step3", "step4"] as const;

  return (
    <Dialog.Root
      placement="center"
      motionPreset="slide-in-bottom"
      size={{ mdDown: "sm", md: "md" }}
    >
      <Dialog.Trigger asChild>
        <IconButton variant="sticker" rounded="full" size="lg" aria-label={tc("rules")}>
          <LuBookOpen />
        </IconButton>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop bg="rgba(26, 40, 38, 0.6)" />
        <Dialog.Positioner px={4}>
          <Dialog.Content layerStyle="sticker" p={0} overflow="hidden">
            <Dialog.Header bg="mint" borderBottom="sticker" py={4}>
              <Dialog.Title fontSize="2xl" fontWeight="700" color="ink">
                {t("title")}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body color="ink" py={5}>
              <Stack as="ol" gap={3} ps={6} fontSize="lg" listStyleType="decimal">
                {steps.map((key) => (
                  <Text as="li" key={key}>
                    {t(key)}
                  </Text>
                ))}
              </Stack>
              <Box
                mt={5}
                bg="sun"
                border="2px solid"
                borderColor="ink"
                borderRadius="lg"
                px={4}
                py={3}
              >
                {t("tip")}
              </Box>
            </Dialog.Body>
            <Dialog.Footer pb={5}>
              <Dialog.ActionTrigger asChild>
                <Button variant="sticker" bg="mint">
                  {t("close")}
                </Button>
              </Dialog.ActionTrigger>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" color="ink" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
