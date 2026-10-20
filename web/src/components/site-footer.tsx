import { Container, HStack, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations("Footer");
  const links = [
    { href: "/about", label: t("about") },
    { href: "/privacy", label: t("privacy") },
    { href: "/terms", label: t("terms") },
  ] as const;

  return (
    <Container as="footer" maxW="4xl" px={4} py={6}>
      <Stack align="center" gap={2} color="cream" opacity={0.85} fontSize="md">
        <HStack as="nav" gap={5} wrap="wrap" justify="center">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </HStack>
        <Text fontSize="sm">{t("tagline")}</Text>
      </Stack>
    </Container>
  );
}
