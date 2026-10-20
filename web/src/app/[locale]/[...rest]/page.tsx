import { notFound } from "next/navigation";

// Bắt mọi đường dẫn không khớp trong [locale] để render [locale]/not-found.tsx
// (có dịch, có layout) thay cho trang 404 mặc định của Next.
export default function CatchAllPage() {
  notFound();
}
