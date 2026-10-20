"use client";

import { Box, Button, Checkbox, Grid, Text } from "@chakra-ui/react";
import { useLocale, useTranslations } from "next-intl";
import { LuShuffle } from "react-icons/lu";
import { getMap, POOL, RANDOM_MAP } from "@/game/maps";

/** Tên map theo ngôn ngữ ("random" → "Ngẫu nhiên"). */
export function useMapName(): (id: string) => string {
  const locale = useLocale();
  const t = useTranslations("Maps");
  return (id) => {
    if (id === RANDOM_MAP) return t("random");
    const m = getMap(id);
    return m ? (locale === "en" ? m.name.en : m.name.vi) : id;
  };
}

/** Hình thu nhỏ của map vẽ từ mặt nạ ô (SVG, mỗi ô thuộc bàn một hình vuông). */
export function MapThumb({ id, size = 44 }: { id: string; size?: number }) {
  const m = getMap(id);
  if (!m) return null;
  const unit = size / Math.max(m.rows, m.cols);
  const w = m.cols * unit;
  const h = m.rows * unit;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g transform={`translate(${(size - w) / 2} ${(size - h) / 2})`}>
        {m.cells.flatMap((row, r) =>
          [...row].map((ch, c) =>
            ch === "#" ? (
              <rect
                key={`${r}-${c}`}
                x={c * unit + 0.5}
                y={r * unit + 0.5}
                width={unit - 1}
                height={unit - 1}
                rx={unit * 0.2}
                fill="currentColor"
              />
            ) : null,
          ),
        )}
      </g>
    </svg>
  );
}

/** Chọn map trong bể hoặc "Ngẫu nhiên" (docs/03 — Map). */
export function MapPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const name = useMapName();
  const options = [...POOL.map((m) => m.id), RANDOM_MAP];
  return (
    <Grid
      gap={2}
      gridTemplateColumns="repeat(auto-fill, minmax(5.5rem, 1fr))"
      role="radiogroup"
      aria-label={label}
    >
      {options.map((id) => {
        const selected = value === id;
        return (
          <Button
            key={id}
            role="radio"
            aria-checked={selected}
            variant="sticker"
            bg={selected ? "mint" : "paper"}
            h="auto"
            minW={0}
            py={2}
            px={2}
            flexDirection="column"
            gap={1}
            onClick={() => onChange(id)}
          >
            <Box color="ink" display="flex" alignItems="center" justifyContent="center" h="11">
              {id === RANDOM_MAP ? <LuShuffle size={30} /> : <MapThumb id={id} size={40} />}
            </Box>
            <Text fontSize="sm" fontWeight="700" whiteSpace="normal" lineHeight="1.1">
              {name(id)}
            </Text>
          </Button>
        );
      })}
    </Grid>
  );
}

/** Bật/tắt đánh dấu các cạnh đối thủ vừa vẽ (cùng kiểu checkbox với cài đặt âm thanh). */
export function ShowLastMoveToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const t = useTranslations("Maps");
  return (
    <Checkbox.Root
      checked={checked}
      onCheckedChange={(e) => onChange(!!e.checked)}
      size="md"
      cursor="pointer"
      alignItems="center"
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control
        boxSize="6"
        borderWidth="2px"
        borderColor="ink"
        bg="paper"
        color="ink"
        _checked={{ bg: "mint", borderColor: "ink", color: "ink" }}
      >
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label fontWeight="600" color="ink">
        {t("showLastMove")}
      </Checkbox.Label>
    </Checkbox.Root>
  );
}
