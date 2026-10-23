import { Box, Circle, Container, Heading, Image, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuBot, LuSwords, LuTrophy, LuUsers } from "react-icons/lu";
import { AdSlot } from "@/components/ads/adsense";
import { GuideArticle } from "@/components/guide-article";
import { HomeActions } from "@/components/home-actions";
import { PlayerPill } from "@/components/player-pill";
import { ModeCard } from "@/components/sticker-card";
import logoHero from "../../../public/brand/logo-hero.svg";

// Trang chủ theo docs/14: bốn thẻ chế độ (máy, xếp hạng, phòng riêng, BXH) đều đã có route.
export default function Home() {
  const t = useTranslations("Home");

  return (
    <Container maxW="4xl" px={4} py={{ base: 4, md: 6 }} flex="1">
      <Stack gap={{ base: 6, md: 8 }}>
        {/* Bảng hiệu kiểu bảng đen (học noitu.fun): nền xanh đậm, viền + bóng sticker, tên kèm tên miền. */}
        <Box
          layerStyle="sticker"
          position="relative"
          bg="board.deep"
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
              src={logoHero.src}
              alt="Ô Kìa — okia.io.vn"
              h={{ base: "72px", md: "110px" }}
              w="auto"
            />
          </Heading>
          <Text mt={4} fontSize={{ base: "md", md: "xl" }} opacity={0.9}>
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
            href="/ranked"
          />
          {/* Ô quảng cáo giữa hai hàng thẻ (docs/10): người ủng hộ không thấy. */}
          <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME} name="home" span />
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
            href="/leaderboard"
          />
        </SimpleGrid>

        <HomeActions />

        <GuideArticle />
      </Stack>
    </Container>
  );
}
