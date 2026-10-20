import { Button, Container, Heading, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <Container maxW="md" py={{ base: 12, md: 24 }} px={4}>
      <Stack gap={4} align="flex-start">
        <Heading as="h1" size="2xl" fontFamily="hand" color="ink.fg">
          {t("title")}
        </Heading>
        <Text color="fg.muted">{t("description")}</Text>
        <Button asChild colorPalette="ink" variant="subtle">
          <Link href="/">{t("backHome")}</Link>
        </Button>
      </Stack>
    </Container>
  );
}
