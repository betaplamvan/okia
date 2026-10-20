import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { RoomScreen } from "@/components/room/room-screen";

// Link mời /r/[code] (P1-19): metadata theo ngôn ngữ để dán vào Zalo/Messenger có tiêu đề + mô tả.
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/r/[code]">): Promise<Metadata> {
  const { code } = await params;
  const t = await getTranslations("Room");
  const title = t("inviteTitle", { code: code.toUpperCase() });
  const description = t("inviteDescription", { code: code.toUpperCase() });
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

// Suspense: route động + client component dùng usePathname() (cacheComponents yêu cầu). `params` phải
// được await BÊN TRONG Suspense, nếu không `next build` lỗi "uncached or runtime data during prerendering".
export default function RoomCodePage({ params }: PageProps<"/[locale]/r/[code]">) {
  return (
    <Suspense fallback={null}>
      <RoomCodeContent params={params} />
    </Suspense>
  );
}

async function RoomCodeContent({ params }: Pick<PageProps<"/[locale]/r/[code]">, "params">) {
  const { code } = await params;
  return <RoomScreen code={code.toUpperCase()} />;
}
