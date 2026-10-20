import { Button, Container, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { ColorModeButton } from "@/components/ui/color-mode";

// Trang chủ tạm cho P0-01: chỉ để kiểm tra theme, font và color mode.
// Chuỗi hiển thị sẽ chuyển sang i18n ở P0-03.
export default function Home() {
  return (
    <Container maxW="md" py={{ base: 8, md: 16 }} px={4}>
      <Stack gap={6}>
        <HStack justify="space-between">
          <Heading as="h1" size={{ base: "3xl", md: "4xl" }} fontFamily="hand" color="ink.fg">
            Ô Kìa
          </Heading>
          <ColorModeButton />
        </HStack>
        <Text color="fg.muted">Trò ăn ô trên giấy ô li.</Text>
        <Stack gap={3}>
          <Button colorPalette="ink" size="lg" disabled>
            Chơi với máy
          </Button>
          <Button colorPalette="redink" variant="outline" size="lg" disabled>
            Phòng riêng
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
