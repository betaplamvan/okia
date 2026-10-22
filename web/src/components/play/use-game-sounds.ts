"use client";

import { useEffect, useRef } from "react";
import { audio } from "@/game/audio/audio-manager";
import type { GameSession } from "@/game/controller";
import { assetUrl, DEFAULT_PEN, skinAssetUrls, type SeatSkins } from "@/game/skins/skins";

// Phát tiếng theo diễn biến ván (docs/08 — Animation & Âm thanh): nét vẽ, ăn ô (cao dần theo
// combo, tiếng của skin bút người vừa đi), tới lượt mình, kết thúc. Chỉ đọc chênh lệch giữa hai
// session liên tiếp.
export function useGameSounds(session: GameSession, skins?: SeatSkins) {
  const prev = useRef<GameSession | null>(null);
  const skinsRef = useRef(skins);
  useEffect(() => {
    skinsRef.current = skins;
    // Tiếng của gói skin (ADR-0014): nạp trước để "ting" đầu tiên không trễ.
    for (const pen of skins?.pens ?? [])
      for (const a of skinAssetUrls(pen).sounds) void audio.loadSfx(a.url, a.ext);
  }, [skins]);

  useEffect(() => {
    const last = prev.current;
    prev.current = session;
    if (!last) return;

    const { state, lastMove, combo, result, human } = session;

    // Ván mới → không phát gì.
    if (state.moveNo < last.state.moveNo) return;

    if (state.moveNo > last.state.moveNo && lastMove) {
      audio.playDraw();
      if (lastMove.captured.length > 0) {
        const n = lastMove.captured.length;
        const pen = skinsRef.current?.pens[lastMove.by] ?? DEFAULT_PEN;
        // Tên trong sprite, hoặc URL file của gói skin.
        const sfx = {
          capture: assetUrl(pen, pen.sfx.capture) ?? pen.sfx.capture,
          combo: assetUrl(pen, pen.sfx.combo) ?? pen.sfx.combo,
        };
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(combo >= 3 ? [15, 30, 25] : 15);
        }
        // Ăn 2 ô một nét → hai "ting" nối nhau.
        lastMove.captured.forEach((_, i) =>
          setTimeout(() => audio.playCapture(combo - n + 1 + i, sfx.capture), 90 + i * 110),
        );
        // Từ ô thứ 2 trong lượt: tiếng COMBO của bút, cao dần theo chuỗi.
        if (combo >= 2) setTimeout(() => audio.playCombo(combo, sfx.combo), 90 + n * 110);
      } else if (state.turn === human && !state.finished) {
        setTimeout(() => audio.play("turn", { volume: 0.5 }), 160);
      }
    }

    if (result && !last.result) {
      const won = result.winner === human;
      setTimeout(() => audio.play(won ? "win" : "lose"), 350);
    }
  }, [session]);
}
