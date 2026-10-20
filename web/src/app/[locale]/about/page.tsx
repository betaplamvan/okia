import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { TextPage } from "@/components/text-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("About");
  return { title: t("title") };
}

export default function AboutPage() {
  const t = useTranslations("About");
  return <TextPage title={t("title")} paragraphs={[t("p1"), t("p2"), t("p3")]} />;
}
