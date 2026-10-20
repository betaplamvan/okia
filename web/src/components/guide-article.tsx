import { Box, Button, Heading, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";

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

// Bài giới thiệu + hướng dẫn trên trang chủ (nội dung trong messages/*.json, namespace Guide).
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
        <Text>{t("intro1")}</Text>
        <Text>{t("intro2")}</Text>

        <Section title={t("rulesTitle")}>
          <Text>{t("rulesIntro")}</Text>
          <Stack as="ol" gap={1} ps={6} listStyleType="decimal">
            {(["rule1", "rule2", "rule3", "rule4"] as const).map((k) => (
              <Text as="li" key={k}>
                {t(k)}
              </Text>
            ))}
          </Stack>
        </Section>

        <Section title={t("howTitle")}>
          <Stack as="ul" gap={1} ps={6} listStyleType="disc">
            {(["how1", "how2", "how3"] as const).map((k) => (
              <Text as="li" key={k}>
                {t(k)}
              </Text>
            ))}
          </Stack>
        </Section>

        <Section title={t("modesTitle")}>
          <Stack as="ul" gap={2} ps={6} listStyleType="disc">
            {([1, 2, 3, 4] as const).map((n) => (
              <Text as="li" key={n}>
                <Text as="strong" fontWeight="700">
                  {t(`mode${n}Title`)}:
                </Text>{" "}
                {t(`mode${n}Desc`)}
              </Text>
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
          <Heading as="h3" size="lg" fontWeight="700" color="ink" mb={2}>
            {t("tipsTitle")}
          </Heading>
          <Stack as="ul" gap={1} ps={6} listStyleType="disc">
            {(["tip1", "tip2", "tip3"] as const).map((k) => (
              <Text as="li" key={k}>
                {t(k)}
              </Text>
            ))}
          </Stack>
        </Box>

        <Section title={t("benefitsTitle")}>
          <Stack as="ul" gap={1} ps={6} listStyleType="disc">
            {(["benefit1", "benefit2", "benefit3"] as const).map((k) => (
              <Text as="li" key={k}>
                {t(k)}
              </Text>
            ))}
          </Stack>
        </Section>

        <Stack align="center" gap={3} pt={2}>
          <Text fontWeight="600">{t("ctaLine")}</Text>
          <Button asChild variant="sticker" size="xl" bg="mint">
            <a href="#modes">{t("cta")}</a>
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
