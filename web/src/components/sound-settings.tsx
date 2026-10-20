"use client";

import { Checkbox, HStack, IconButton, Popover, Portal, Slider, Stack } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { LuVolume2, LuVolumeX } from "react-icons/lu";
import { audio } from "@/game/audio/audio-manager";
import {
  getAudioSettings,
  getServerAudioSettings,
  subscribeAudioSettings,
  updateAudioSettings,
} from "@/game/audio/audio-settings";

// Popover cài đặt âm thanh (học từ noitu): mỗi kênh có bật/tắt + thanh âm lượng.
export function SoundSettings() {
  const t = useTranslations("Sound");
  const s = useSyncExternalStore(subscribeAudioSettings, getAudioSettings, getServerAudioSettings);
  const allOff = !s.musicOn && !s.sfxOn;

  return (
    <Popover.Root positioning={{ placement: "bottom-end" }} lazyMount unmountOnExit>
      <Popover.Trigger asChild>
        <IconButton variant="sticker" rounded="full" size="sm" aria-label={t("title")}>
          {allOff ? <LuVolumeX /> : <LuVolume2 />}
        </IconButton>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content layerStyle="sticker" w="64" p={0}>
            <Popover.Body p={4}>
              <Stack gap={4}>
                <Channel
                  label={t("music")}
                  on={s.musicOn}
                  volume={s.musicVolume}
                  onToggle={(on) => updateAudioSettings({ musicOn: on })}
                  onVolume={(v) => updateAudioSettings({ musicVolume: v })}
                />
                <Channel
                  label={t("sfx")}
                  on={s.sfxOn}
                  volume={s.sfxVolume}
                  onToggle={(on) => {
                    updateAudioSettings({ sfxOn: on });
                    if (on) audio.playUi("confirm");
                  }}
                  onVolume={(v) => updateAudioSettings({ sfxVolume: v })}
                  onVolumeEnd={() => audio.playUi("click")}
                />
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

type ChannelProps = {
  label: string;
  on: boolean;
  volume: number;
  onToggle: (on: boolean) => void;
  onVolume: (v: number) => void;
  onVolumeEnd?: () => void;
};

function Channel({ label, on, volume, onToggle, onVolume, onVolumeEnd }: ChannelProps) {
  return (
    <Stack gap={2}>
      <HStack justify="space-between">
        <Checkbox.Root
          checked={on}
          onCheckedChange={(e) => onToggle(!!e.checked)}
          colorPalette="green"
          size="md"
          flexDirection="row-reverse"
          justifyContent="space-between"
          w="full"
          cursor="pointer"
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control borderColor="ink" borderWidth="2px" bg="paper" />
          <Checkbox.Label fontWeight="600" fontSize="lg" color="ink">
            {label}
          </Checkbox.Label>
        </Checkbox.Root>
      </HStack>
      <Slider.Root
        value={[Math.round(volume * 100)]}
        min={0}
        max={100}
        disabled={!on}
        // Chakra Slider nhận một nhãn cho mỗi thumb (mảng); spread để rule jsx-a11y không coi là chuỗi.
        {...{ "aria-label": [label] }}
        onValueChange={(e) => onVolume(e.value[0] / 100)}
        onValueChangeEnd={() => onVolumeEnd?.()}
        size="md"
      >
        <Slider.Control>
          <Slider.Track bg="rgba(26,40,38,0.12)" h="2">
            <Slider.Range bg="ink" />
          </Slider.Track>
          <Slider.Thumbs boxSize="5" bg="ink" borderColor="ink" />
        </Slider.Control>
      </Slider.Root>
    </Stack>
  );
}
