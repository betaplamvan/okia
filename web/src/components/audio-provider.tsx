"use client";

import { useEffect } from "react";
import { audio } from "@/game/audio/audio-manager";

// Khởi tạo AudioManager một lần cho toàn app (nạp sprite, đăng ký mở khóa nhạc nền).
export function AudioProvider() {
  useEffect(() => {
    void audio.init();
  }, []);
  return null;
}
