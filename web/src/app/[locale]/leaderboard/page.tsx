import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Leaderboard } from "@/components/ranked/leaderboard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Leaderboard");
  return { title: t("title"), description: t("intro") };
}

// Bảng xếp hạng mùa hiện tại (docs/07, P2-09).
export default function LeaderboardPage() {
  return <Leaderboard />;
}
