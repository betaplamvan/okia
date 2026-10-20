import { Box, Container, Flex, Heading, HStack } from "@chakra-ui/react";
import { ColorModeButton } from "@/components/ui/color-mode";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "@/i18n/navigation";

type AppShellProps = { children: React.ReactNode };

// Khung chung mobile-first: header mỏng, nội dung co theo chiều cao màn hình (100dvh).
// Màn chơi (/play) sẽ dùng khung riêng không header để tối đa diện tích bàn đấu.
export function AppShell({ children }: AppShellProps) {
  return (
    <Flex direction="column" minH="100dvh">
      <Box
        as="header"
        borderBottomWidth="1px"
        borderColor="border"
        bg="bg"
        position="sticky"
        top={0}
        zIndex="sticky"
      >
        <Container maxW="4xl" px={4} py={2}>
          <HStack justify="space-between">
            <Heading
              asChild
              size={{ base: "2xl", md: "3xl" }}
              fontFamily="hand"
              color="ink.fg"
              lineHeight="1"
            >
              <Link href="/">Ô Kìa</Link>
            </Heading>
            <HStack gap={2}>
              <LanguageSwitcher />
              <ColorModeButton />
            </HStack>
          </HStack>
        </Container>
      </Box>
      <Box as="main" flex="1" display="flex" flexDirection="column">
        {children}
      </Box>
    </Flex>
  );
}
