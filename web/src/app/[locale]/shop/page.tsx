import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShopScreen } from "@/components/shop/shop-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Shop");
  return { title: t("title"), description: t("intro") };
}

// Cửa hàng skin bút / ô đã ăn (docs/06 — Shop, docs/08, ADR-0013).
export default function ShopPage() {
  return <ShopScreen />;
}
