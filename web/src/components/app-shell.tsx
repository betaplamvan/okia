import { Box, Container, Flex, Heading, HStack } from "@chakra-ui/react";
import { AudioProvider } from "@/components/audio-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import { UserButton } from "@/components/auth/user-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SiteFooter } from "@/components/site-footer";
import { SoundSettings } from "@/components/sound-settings";
import { Toaster } from "@/components/ui/toaster";
import { Link } from "@/i18n/navigation";

type AppShellProps = { children: React.ReactNode };

// Khung chung mobile-first (docs/14): header trong suốt trên nền xanh, nội dung co theo 100dvh, footer.
// AuthProvider khởi động phiên (refresh → khách) và chứa hộp thoại hồ sơ dùng chung mọi trang.
export function AppShell({ children }: AppShellProps) {
  return (
    <Flex direction="column" minH="100dvh">
      <AudioProvider />
      <AuthProvider />
      <Toaster />
      <Box as="header">
        <Container maxW="4xl" px={4} py={3}>
          <HStack justify="space-between">
            <Heading
              asChild
              size={{ base: "2xl", md: "3xl" }}
              color="cream"
              textShadow="stickerText"
              lineHeight="1"
              letterSpacing="0.5px"
            >
              <Link href="/">Ô Kìa</Link>
            </Heading>
            <HStack gap={2}>
              <SoundSettings />
              <LanguageSwitcher />
              <UserButton />
            </HStack>
          </HStack>
        </Container>
      </Box>
      <Box as="main" flex="1" display="flex" flexDirection="column">
        {children}
      </Box>
      <SiteFooter />
    </Flex>
  );
}
