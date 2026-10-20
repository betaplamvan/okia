import { Circle, HStack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuPencil, LuUser } from "react-icons/lu";

// Pill người chơi trên trang chủ. Giai đoạn 0 chưa có tài khoản → luôn là khách với 0 Ruột chì.
// Giai đoạn 1 sẽ nhận dữ liệu từ /me.
export function PlayerPill() {
  const t = useTranslations("Common");

  return (
    <HStack
      justify="center"
      gap={2}
      bg="paper"
      color="ink"
      border="sticker"
      borderRadius="full"
      boxShadow="sticker"
      px={2}
      py={1}
      mx="auto"
      w="fit-content"
    >
      <Circle size="8" bg="mint" border="2px solid" borderColor="ink">
        <LuUser />
      </Circle>
      <Text fontWeight="600" pe={2}>
        {t("guest")}
      </Text>
      <HStack
        gap={1}
        bg="sun"
        border="2px solid"
        borderColor="ink"
        borderRadius="full"
        px={3}
        py={0.5}
        fontWeight="600"
        aria-label={t("lead")}
        title={t("lead")}
      >
        <LuPencil />
        <Text as="span">0</Text>
      </HStack>
    </HStack>
  );
}
