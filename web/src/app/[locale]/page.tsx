import { Box, Container, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuBot, LuSwords, LuTrophy, LuUsers } from "react-icons/lu";
import { ModeCard } from "@/components/sticker-card";

// Trang chủ theo docs/14: hero sticker + 4 thẻ chế độ. Thẻ được nối vào route ở P0-07+ / giai đoạn 1–2.
export default function Home() {
  const t = useTranslations("Home");
  const soon = t("comingSoon");

  return (
    <Container maxW="4xl" px={4} py={{ base: 4, md: 8 }} flex="1">
      <Stack gap={{ base: 6, md: 8 }}>
        <Box
          layerStyle="sticker"
          bg="rgba(26, 40, 38, 0.35)"
          color="cream"
          textAlign="center"
          px={5}
          py={{ base: 6, md: 8 }}
        >
          <Heading
            as="h1"
            size={{ base: "5xl", md: "7xl" }}
            fontWeight="700"
            lineHeight="1"
            textShadow="stickerText"
            letterSpacing="1px"
          >
            Ô Kìa
          </Heading>
          <Text mt={3} fontSize={{ base: "lg", md: "xl" }} opacity={0.9}>
            {t("tagline")}
          </Text>
        </Box>

        <SimpleGrid columns={{ base: 1, sm: 2 }} gap={{ base: 4, md: 5 }}>
          <ModeCard
            tone="mint"
            icon={<LuBot />}
            title={t("playBot")}
            description={t("playBotSub")}
            badge={soon}
          />
          <ModeCard
            tone="coral"
            icon={<LuSwords />}
            title={t("ranked")}
            description={t("rankedSub")}
            badge={soon}
          />
          <ModeCard
            tone="pink"
            icon={<LuUsers />}
            title={t("privateRoom")}
            description={t("privateRoomSub")}
            badge={soon}
          />
          <ModeCard
            tone="sun"
            icon={<LuTrophy />}
            title={t("leaderboard")}
            description={t("leaderboardSub")}
            badge={soon}
          />
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
