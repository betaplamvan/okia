import { Container, HStack } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuCoffee, LuFileText, LuInfo, LuShield } from "react-icons/lu";
import { Link } from "@/i18n/navigation";

// Footer (docs/14, theo noitu): các link có icon, hover nền sáng nhẹ; không còn dòng tagline.
export function SiteFooter() {
  const t = useTranslations("Footer");
  const links = [
    { href: "/about", label: t("about"), icon: LuInfo },
    { href: "/donate", label: t("donate"), icon: LuCoffee },
    { href: "/privacy", label: t("privacy"), icon: LuShield },
    { href: "/terms", label: t("terms"), icon: LuFileText },
  ] as const;

  return (
    <Container as="footer" maxW="4xl" px={4} py={5}>
      <HStack as="nav" gap={{ base: 2, md: 4 }} wrap="wrap" justify="center" color="cream">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 18px",
              borderRadius: 999,
              fontWeight: 600,
              transition: "background 0.15s, color 0.15s",
            }}
            className="okia-footer-link"
          >
            <Icon size={16} /> {label}
          </Link>
        ))}
      </HStack>
    </Container>
  );
}
