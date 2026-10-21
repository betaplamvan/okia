import { Box, Container, Flex, HStack, Image } from "@chakra-ui/react";
import { Suspense } from "react";
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
      {/* Suspense: các client component này đọc usePathname(); route động (/r/[code]) với
          cacheComponents yêu cầu giá trị runtime như vậy phải nằm trong Suspense. */}
      <Suspense fallback={null}>
        <AuthProvider />
      </Suspense>
      <Toaster />
      <Box as="header">
        <Container maxW="4xl" px={4} py={3}>
          <HStack justify="space-between">
            {/* Logo ngang (mark thay chữ Ô + "Kìa"), bản nét giấy cho nền xanh — public/brand. */}
            <Link href="/" aria-label="Ô Kìa">
              <Image
                src="/brand/logo-dark.svg"
                alt="Ô Kìa"
                h={{ base: "36px", md: "44px" }}
                w="auto"
                display="block"
              />
            </Link>
            <HStack gap={2}>
              <SoundSettings />
              <Suspense fallback={null}>
                <LanguageSwitcher />
                <UserButton />
              </Suspense>
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
