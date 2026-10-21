import { Box, Circle, Container, Heading, Image, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuBot, LuSwords, LuTrophy, LuUsers } from "react-icons/lu";
import { GuideArticle } from "@/components/guide-article";
import { HomeActions } from "@/components/home-actions";
import { PlayerPill } from "@/components/player-pill";
import { ModeCard } from "@/components/sticker-card";

// Trang chủ theo docs/14. Thẻ chế độ được nối vào route ở P0-07+ / giai đoạn 1–2.
export default function Home() {
  const t = useTranslations("Home");
  const soon = t("comingSoon");

  return (
    <Container maxW="4xl" px={4} py={{ base: 4, md: 6 }} flex="1">
      <Stack gap={{ base: 6, md: 8 }}>
        <Box
          layerStyle="sticker"
          position="relative"
          bg="rgba(26, 40, 38, 0.35)"
          color="cream"
          textAlign="center"
          px={5}
          py={{ base: 6, md: 8 }}
        >
          <Circle
            size="3"
            bg="mint"
            border="2px solid"
            borderColor="ink"
            position="absolute"
            top={3}
            left={3}
          />
          <Circle
            size="3"
            bg="sun"
            border="2px solid"
            borderColor="ink"
            position="absolute"
            bottom={3}
            right={3}
          />
          {/* Logo thay chữ; vẫn là h1 với alt "Ô Kìa" cho SEO/đọc màn hình. */}
          <Heading as="h1" lineHeight="1" display="flex" justifyContent="center">
            <Image
              src="/brand/logo-dark.svg"
              alt="Ô Kìa"
              h={{ base: "84px", md: "120px" }}
              w="auto"
            />
          </Heading>
          <Text mt={3} fontSize={{ base: "lg", md: "xl" }} opacity={0.9}>
            {t("tagline")}
          </Text>
        </Box>

        <PlayerPill />

        <SimpleGrid
          id="modes"
          columns={{ base: 1, sm: 2 }}
          gap={{ base: 4, md: 5 }}
          scrollMarginTop={4}
        >
          <ModeCard
            tone="mint"
            icon={<LuBot />}
            title={t("playBot")}
            description={t("playBotSub")}
            href="/play"
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
            href="/room"
          />
          <ModeCard
            tone="sun"
            icon={<LuTrophy />}
            title={t("leaderboard")}
            description={t("leaderboardSub")}
            badge={soon}
          />
        </SimpleGrid>

        <HomeActions />

        <GuideArticle />
      </Stack>
    </Container>
  );
}
