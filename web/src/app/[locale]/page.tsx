import { Button, Container, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";

// Trang chủ tạm (P0-04): nội dung mẫu trên khung responsive; nút bật ở P0-11/P1-19.
export default function Home() {
  const t = useTranslations("Home");

  return (
    <Container maxW="4xl" px={4} py={{ base: 8, md: 16 }} flex="1">
      <Stack gap={{ base: 8, md: 12 }}>
        <Stack gap={3} textAlign={{ base: "left", md: "center" }}>
          <Heading
            as="h1"
            size={{ base: "4xl", md: "6xl" }}
            fontFamily="hand"
            color="ink.fg"
            lineHeight="1.1"
          >
            Ô Kìa
          </Heading>
          <Text fontSize={{ base: "md", md: "lg" }} color="fg.muted">
            {t("tagline")}
          </Text>
        </Stack>
        <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3} maxW="lg" mx={{ md: "auto" }} w="full">
          <Button colorPalette="ink" size="xl" disabled>
            {t("playBot")}
          </Button>
          <Button colorPalette="redink" variant="outline" size="xl" disabled>
            {t("privateRoom")}
          </Button>
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
