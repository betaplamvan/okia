import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { TextPage } from "@/components/text-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Privacy");
  return { title: t("title") };
}

export default function PrivacyPage() {
  const t = useTranslations("Privacy");
  return (
    <TextPage
      title={t("title")}
      note={t("updated")}
      paragraphs={[t("p1"), t("p2"), t("p3"), t("p4")]}
    />
  );
}
