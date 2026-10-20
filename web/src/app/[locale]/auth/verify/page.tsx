import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VerifyScreen } from "@/components/auth/verify-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("verifyPage.title") };
}

// Link trong email xác minh (docs/13): /auth/verify?token=… → gọi POST /auth/verify.
export default function VerifyPage() {
  return <VerifyScreen />;
}
