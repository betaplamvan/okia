import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RankedScreen } from "@/components/ranked/ranked-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Ranked");
  return { title: t("title") };
}

// Xếp hạng (docs/07, P2-07): thẻ hạng của tôi + tìm trận; ghép xong chuyển sang /r/<id>.
export default function RankedPage() {
  return <RankedScreen />;
}
