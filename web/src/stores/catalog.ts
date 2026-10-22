"use client";

import { create } from "zustand";
import { SKIN_SOURCES } from "@/game/skins/catalog.data";
import { registerSkins, type SkinManifest } from "@/game/skins/skins";

/**
 * Catalog skin lúc chạy (docs/08): khởi đầu là bản biên dịch (catalog.data.ts, cũng là bản seed của
 * API), sau khi tải `GET /skins` thì thay bằng catalog thật trong DB (admin thêm/sửa/tắt skin không
 * cần deploy web). `registerSkins` cập nhật bảng tra của engine; store để React re-render.
 */
type CatalogState = {
  skins: readonly SkinManifest[];
  /** Đã tải từ API chưa (false = đang dùng bản biên dịch). */
  live: boolean;
  setCatalog(skins: readonly SkinManifest[]): void;
};

export const useCatalog = create<CatalogState>((set) => ({
  skins: SKIN_SOURCES,
  live: false,
  setCatalog(skins) {
    if (!registerSkins(skins)) return;
    set({ skins, live: true });
  },
}));
