import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlayGate } from "@/components/play/play-gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Play");
  return { title: t("title") };
}

// Chơi với máy (giai đoạn 0: bot chạy trong trình duyệt, không thưởng Ruột chì — docs/03).
export default function PlayPage() {
  return <PlayGate />;
}
