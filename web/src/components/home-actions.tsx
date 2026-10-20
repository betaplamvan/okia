import { HStack, IconButton } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuCircleHelp } from "react-icons/lu";
import { RulesDialog } from "@/components/rules-dialog";
import { ShareButton } from "@/components/share-button";

// Hàng nút tròn dưới các thẻ chế độ: luật chơi, hướng dẫn (cuộn xuống bài viết), chia sẻ.
export function HomeActions() {
  const t = useTranslations("Common");

  return (
    <HStack justify="center" gap={4} pb={4}>
      <RulesDialog />
      <IconButton asChild variant="sticker" rounded="full" size="lg" aria-label={t("help")}>
        <a href="#guide">
          <LuCircleHelp />
        </a>
      </IconButton>
      <ShareButton />
    </HStack>
  );
}
