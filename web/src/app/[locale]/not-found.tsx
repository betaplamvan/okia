import { Box, Button, Container, Heading, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <Container maxW="md" py={{ base: 8, md: 16 }} px={4}>
      <Box layerStyle="sticker" p={{ base: 6, md: 8 }}>
        <Stack gap={4} align="flex-start">
          <Heading as="h1" size="3xl" fontWeight="700" color="ink">
            {t("title")}
          </Heading>
          <Text color="ink" opacity={0.85}>
            {t("description")}
          </Text>
          <Button asChild variant="sticker" bg="mint">
            <Link href="/">{t("backHome")}</Link>
          </Button>
        </Stack>
      </Box>
    </Container>
  );
}
