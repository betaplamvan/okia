import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetScreen } from "@/components/auth/reset-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("resetPage.title") };
}

// Link trong email đặt lại mật khẩu (docs/13): /auth/reset?token=… → form mật khẩu mới.
export default function ResetPage() {
  return <ResetScreen />;
}
