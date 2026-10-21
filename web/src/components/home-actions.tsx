import { HStack, IconButton } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuCircleHelp, LuShoppingBag } from "react-icons/lu";
import { RulesDialog } from "@/components/rules-dialog";
import { ShareButton } from "@/components/share-button";
import { Link } from "@/i18n/navigation";

// Hàng nút tròn dưới các thẻ chế độ: cửa hàng, luật chơi, hướng dẫn (cuộn xuống bài viết), chia sẻ.
export function HomeActions() {
  const t = useTranslations("Common");

  return (
    <HStack justify="center" gap={4} pb={4}>
      <IconButton
        asChild
        variant="sticker"
        rounded="full"
        size="lg"
        bg="sun"
        aria-label={t("shop")}
      >
        <Link href="/shop">
          <LuShoppingBag />
        </Link>
      </IconButton>
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
