import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminScreen } from "@/components/admin/admin-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");
  return { title: t("title"), robots: { index: false, follow: false } };
}

// Trang quản trị (docs/13 — Admin): API chặn theo ADMIN_EMAILS; client chỉ ẩn/hiện theo /me.isAdmin.
export default function AdminPage() {
  return <AdminScreen />;
}
