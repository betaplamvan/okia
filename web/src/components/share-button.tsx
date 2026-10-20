"use client";

import { IconButton, Text, VStack } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LuCheck, LuShare2 } from "react-icons/lu";

// Chia sẻ link trang hiện tại: Web Share API trên điện thoại, fallback sao chép vào clipboard.
export function ShareButton() {
  const t = useTranslations("Common");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  async function share() {
    const url = window.location.href;
    const data = { title: t("appName"), text: t("shareText"), url };
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        // Người dùng hủy hộp thoại chia sẻ → dừng; lỗi khác (môi trường không hỗ trợ) → sao chép.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard bị chặn: không làm gì.
    }
  }

  return (
    <VStack gap={1} position="relative">
      <IconButton
        variant="sticker"
        rounded="full"
        size="lg"
        aria-label={t("share")}
        bg={copied ? "mint" : "paper"}
        onClick={share}
      >
        {copied ? <LuCheck /> : <LuShare2 />}
      </IconButton>
      <Text
        role="status"
        aria-live="polite"
        position="absolute"
        top="100%"
        mt={1}
        fontSize="sm"
        color="cream"
        whiteSpace="nowrap"
        opacity={copied ? 1 : 0}
        transition="opacity 0.2s"
      >
        {t("copied")}
      </Text>
    </VStack>
  );
}
