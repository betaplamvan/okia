import { Box, Container, Flex, HStack, Image } from "@chakra-ui/react";
import { Suspense } from "react";
import { AudioProvider } from "@/components/audio-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import { UserButton } from "@/components/auth/user-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { BackButton, PageBreadcrumb } from "@/components/page-nav";
import { SiteFooter } from "@/components/site-footer";
import { SoundSettings } from "@/components/sound-settings";
import { Toaster } from "@/components/ui/toaster";
import { Link } from "@/i18n/navigation";
// Import tĩnh → URL có hash, đổi logo là đổi URL (Cloudflare/trình duyệt không giữ bản cũ).
import logoDark from "../../public/brand/logo-dark.svg";

type AppShellProps = { children: React.ReactNode };

// Khung chung mobile-first (docs/14): header trong suốt trên nền xanh, nội dung co theo 100dvh, footer.
// Trang con: header có breadcrumb "logo › tên trang", trên nội dung có nút "Quay lại" (page-nav).
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
          <HStack justify="space-between" gap={3}>
            <HStack gap={{ base: 1, md: 2 }} minW={0}>
              {/* Logo ngang (mark thay chữ ô + "kìa"), bản nét giấy cho nền xanh — public/brand. */}
              <Link href="/" aria-label="Ô Kìa" style={{ flexShrink: 0 }}>
                <Image
                  src={logoDark.src}
                  alt="Ô Kìa"
                  h={{ base: "36px", md: "44px" }}
                  w="auto"
                  display="block"
                />
              </Link>
              <Suspense fallback={null}>
                <PageBreadcrumb />
              </Suspense>
            </HStack>
            <HStack gap={2} flexShrink={0}>
              <SoundSettings />
              <Suspense fallback={null}>
                <LanguageSwitcher />
                <UserButton />
              </Suspense>
            </HStack>
          </HStack>
        </Container>
      </Box>
      <Box as="main" flex="1" display="flex" flexDirection="column" position="relative">
        <Suspense fallback={null}>
          <BackButton />
        </Suspense>
        {children}
      </Box>
      <SiteFooter />
    </Flex>
  );
}
