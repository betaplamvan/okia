"use client";

import { useEffect } from "react";
import { audio } from "@/game/audio/audio-manager";
import { attachUiSounds } from "@/game/audio/ui-sounds";

// Khởi tạo AudioManager một lần cho toàn app (nạp sprite, đăng ký mở khóa nhạc nền) và gắn tiếng
// bấm chung cho mọi nút (ui-sounds.ts).
export function AudioProvider() {
  useEffect(() => {
    void audio.init();
    return attachUiSounds();
  }, []);
  return null;
}
