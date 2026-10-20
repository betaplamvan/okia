import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoomLobby } from "@/components/room/room-lobby";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Room");
  return { title: t("title") };
}

// Sảnh phòng riêng (docs/09 P1-19): tạo phòng hoặc vào bằng mã.
export default function RoomPage() {
  return <RoomLobby />;
}
