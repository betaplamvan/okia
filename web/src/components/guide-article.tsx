import { Box, Button, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuGamepad2, LuLightbulb } from "react-icons/lu";
import { Link } from "@/i18n/navigation";

type SectionProps = { title: string; children: React.ReactNode };

function Section({ title, children }: SectionProps) {
  return (
    <Stack gap={2}>
      <Heading
        as="h3"
        size="xl"
        fontWeight="700"
        color="ink"
        borderLeft="4px solid"
        borderColor="mint"
        ps={3}
      >
        {title}
      </Heading>
      {children}
    </Stack>
  );
}

/** Thẻ dùng trong nội dung (t.rich): <b>đậm</b>, <bot|room|ranked|shop>liên kết</…>. */
const bold = (chunks: React.ReactNode) => (
  <Text as="strong" fontWeight="700">
    {chunks}
  </Text>
);
const link = (href: string) => {
  function GuideLink(chunks: React.ReactNode) {
    return (
      <Box
        as="span"
        fontWeight="700"
        textDecoration="underline"
        textDecorationColor="coral"
        textDecorationThickness="3px"
        textUnderlineOffset="3px"
        _hover={{ bg: "sun" }}
      >
        <Link href={href}>{chunks}</Link>
      </Box>
    );
  }
  return GuideLink;
};
const RICH = {
  b: bold,
  bot: link("/play"),
  room: link("/room"),
  ranked: link("/ranked"),
  shop: link("/shop"),
};

/** Một dòng danh sách có biểu tượng emoji đầu dòng (như noitu.fun). */
function IconItem({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <HStack as="li" align="flex-start" gap={2}>
      <Text as="span" aria-hidden flexShrink={0}>
        {icon}
      </Text>
      <Text as="span">{children}</Text>
    </HStack>
  );
}

const MODES = [
  ["🤖", "mode1"],
  ["⚔️", "mode2"],
  ["🔗", "mode3"],
  ["🏆", "mode4"],
] as const;
const ONLINE = [
  ["⏱️", "online1"],
  ["🚫", "online2"],
  ["🏳️", "online3"],
] as const;
const BENEFITS = [
  ["🧠", "benefit1"],
  ["⚡", "benefit2"],
  ["👫", "benefit3"],
  ["🎁", "benefit4"],
] as const;

// Bài giới thiệu + hướng dẫn trên trang chủ (nội dung trong messages/*.json, namespace Guide).
// Nội dung phải khớp thực tế: chế độ, bàn, điểm hạng, Ruột chì / Hoa điểm tốt (api/app/rating,
// api/app/economy, shared/maps) — sửa luật / kinh tế thì sửa cả bài này.
export function GuideArticle() {
  const t = useTranslations("Guide");

  return (
    <Box
      as="article"
      id="guide"
      layerStyle="sticker"
      px={{ base: 5, md: 8 }}
      py={{ base: 6, md: 8 }}
    >
      <Stack gap={6} color="ink" fontSize="lg">
        <Heading as="h2" size={{ base: "2xl", md: "3xl" }} fontWeight="700" color="ink">
          {t("title")}
        </Heading>
        <Text>{t.rich("intro1", RICH)}</Text>
        <Text>{t.rich("intro2", RICH)}</Text>

        <Section title={t("rulesTitle")}>
          <Text>{t("rulesIntro")}</Text>
          <Stack as="ol" gap={1} ps={6} listStyleType="decimal">
            {(["rule1", "rule2", "rule3", "rule4"] as const).map((k) => (
              <Text as="li" key={k}>
                {t.rich(k, RICH)}
              </Text>
            ))}
          </Stack>
        </Section>

        <Section title={t("howTitle")}>
          <Text>{t.rich("how1", RICH)}</Text>
          <Text>{t.rich("how2", RICH)}</Text>
        </Section>

        <Section title={t("modesTitle")}>
          <Text>{t("modesIntro")}</Text>
          <Stack as="ul" gap={2} listStyleType="none">
            {MODES.map(([icon, k]) => (
              <IconItem key={k} icon={icon}>
                <Text as="strong" fontWeight="700">
                  {t(`${k}Title`)}:
                </Text>{" "}
                {t(`${k}Desc`)}
              </IconItem>
            ))}
          </Stack>
        </Section>

        <Section title={t("boardsTitle")}>
          <Text>{t.rich("boards", RICH)}</Text>
        </Section>

        <Section title={t("rewardsTitle")}>
          <Stack as="ul" gap={1} ps={6} listStyleType="disc">
            {(["reward1", "reward2", "reward3"] as const).map((k) => (
              <Text as="li" key={k}>
                {t.rich(k, RICH)}
              </Text>
            ))}
          </Stack>
        </Section>

        <Section title={t("onlineTitle")}>
          <Stack as="ul" gap={2} listStyleType="none">
            {ONLINE.map(([icon, k]) => (
              <IconItem key={k} icon={icon}>
                {t.rich(k, RICH)}
              </IconItem>
            ))}
          </Stack>
        </Section>

        <Section title={t("benefitsTitle")}>
          <Stack as="ul" gap={2} listStyleType="none">
            {BENEFITS.map(([icon, k]) => (
              <IconItem key={k} icon={icon}>
                {t.rich(k, RICH)}
              </IconItem>
            ))}
          </Stack>
        </Section>

        <Box
          bg="sun"
          border="sticker"
          borderRadius="sticker"
          boxShadow="sticker"
          px={{ base: 4, md: 6 }}
          py={5}
        >
          <HStack gap={2} mb={2}>
            <Box
              as="span"
              display="inline-flex"
              bg="paper"
              border="2px solid"
              borderColor="ink"
              borderRadius="full"
              p={1.5}
            >
              <LuLightbulb />
            </Box>
            <Heading as="h3" size="lg" fontWeight="700" color="ink">
              {t("tipsTitle")}
            </Heading>
          </HStack>
          <Stack as="ul" gap={1} ps={6} listStyleType="disc">
            {(["tip1", "tip2", "tip3", "tip4"] as const).map((k) => (
              <Text as="li" key={k}>
                {t.rich(k, RICH)}
              </Text>
            ))}
          </Stack>
        </Box>

        <Stack align="center" gap={3} pt={2}>
          <Text fontWeight="700" textAlign="center">
            {t("ctaLine")}
          </Text>
          <Button asChild variant="sticker" size="xl" bg="mint">
            <a href="#modes">
              <LuGamepad2 /> {t("cta")}
            </a>
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
