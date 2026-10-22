import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DonateScreen } from "@/components/donate/donate-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Donate");
  return { title: t("title"), description: t("intro") };
}

export default function DonatePage() {
  return <DonateScreen />;
}
