import { Button, Container, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ColorModeButton } from "@/components/ui/color-mode";

// Trang chủ tạm (P0-03/P0-04): kiểm tra theme, font, color mode và i18n.
export default function Home() {
  const t = useTranslations("Home");

  return (
    <Container maxW="md" py={{ base: 8, md: 16 }} px={4}>
      <Stack gap={6}>
        <HStack justify="space-between">
          <Heading as="h1" size={{ base: "3xl", md: "4xl" }} fontFamily="hand" color="ink.fg">
            Ô Kìa
          </Heading>
          <HStack gap={2}>
            <LanguageSwitcher />
            <ColorModeButton />
          </HStack>
        </HStack>
        <Text color="fg.muted">{t("tagline")}</Text>
        <Stack gap={3}>
          <Button colorPalette="ink" size="lg" disabled>
            {t("playBot")}
          </Button>
          <Button colorPalette="redink" variant="outline" size="lg" disabled>
            {t("privateRoom")}
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
