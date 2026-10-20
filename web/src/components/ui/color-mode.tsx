"use client";

import type { IconButtonProps, SpanProps } from "@chakra-ui/react";
import { ClientOnly, IconButton, Skeleton, Span } from "@chakra-ui/react";
import * as React from "react";
import { LuMoon, LuSun } from "react-icons/lu";

// Thay cho next-themes (không còn bảo trì, gây lỗi hydration với React 19.3 / Next 16.2+):
// - COLOR_MODE_SCRIPT được root layout chèn bằng next/script beforeInteractive: Next hoist
//   script ra ngoài cây React và chạy trước khi hydrate để đặt class "dark"/"light" (chống nháy).
// - Provider đọc trạng thái từ DOM qua useSyncExternalStore nên không lệch server/client.
// Chakra v3 nhận biết chế độ tối qua class ".dark" trên <html>.

export type ColorMode = "light" | "dark";
export type ColorModePreference = ColorMode | "system";

export const COLOR_MODE_STORAGE_KEY = "okia-color-mode";

export type ColorModeProviderProps = {
  children?: React.ReactNode;
  /** Ép một chế độ cố định (dùng cho màn hình đặc biệt). */
  forcedTheme?: ColorMode;
};

// Chạy trước khi hydrate; giữ tối giản và không phụ thuộc gì ngoài DOM. Nội dung là hằng số,
// không chứa dữ liệu người dùng. Root layout chèn bằng <Script strategy="beforeInteractive">.
export const COLOR_MODE_SCRIPT = `(function(){try{var k=${JSON.stringify(COLOR_MODE_STORAGE_KEY)};var p=localStorage.getItem(k);var m=p==="dark"||p==="light"?p:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var c=document.documentElement.classList;c.remove("light","dark");c.add(m);document.documentElement.style.colorScheme=m;}catch(e){}})();`;

type ColorModeContextValue = {
  colorMode: ColorMode;
  preference: ColorModePreference;
  setColorMode: (mode: ColorModePreference) => void;
  toggleColorMode: () => void;
};

const ColorModeContext = React.createContext<ColorModeContextValue | null>(null);

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function readPreference(): ColorModePreference {
  try {
    const p = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return p === "dark" || p === "light" ? p : "system";
  } catch {
    return "system";
  }
}

function systemMode(): ColorMode {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyMode(mode: ColorMode) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(mode);
  root.style.colorScheme = mode;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (readPreference() === "system") applyMode(systemMode());
    listener();
  };
  mq.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", onSystemChange);
  };
}

const getPreferenceSnapshot = () => readPreference();
const getServerPreference = (): ColorModePreference => "system";
const getModeSnapshot = (): ColorMode =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";
const getServerMode = (): ColorMode => "light";

export function ColorModeProvider({ children, forcedTheme }: ColorModeProviderProps) {
  const preference = React.useSyncExternalStore(
    subscribe,
    getPreferenceSnapshot,
    getServerPreference,
  );
  const domMode = React.useSyncExternalStore(subscribe, getModeSnapshot, getServerMode);
  const colorMode = forcedTheme ?? domMode;

  React.useEffect(() => {
    if (forcedTheme) applyMode(forcedTheme);
  }, [forcedTheme]);

  const setColorMode = React.useCallback((mode: ColorModePreference) => {
    try {
      if (mode === "system") localStorage.removeItem(COLOR_MODE_STORAGE_KEY);
      else localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
    } catch {
      // Private mode / bị chặn storage: vẫn đổi theme cho phiên hiện tại.
    }
    applyMode(mode === "system" ? systemMode() : mode);
    notify();
  }, []);

  const toggleColorMode = React.useCallback(() => {
    setColorMode(getModeSnapshot() === "dark" ? "light" : "dark");
  }, [setColorMode]);

  const value = React.useMemo(
    () => ({ colorMode, preference, setColorMode, toggleColorMode }),
    [colorMode, preference, setColorMode, toggleColorMode],
  );

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

export function useColorMode(): ColorModeContextValue {
  const ctx = React.useContext(ColorModeContext);
  if (!ctx) throw new Error("useColorMode phải dùng bên trong <ColorModeProvider>");
  return ctx;
}

export function useColorModeValue<T>(light: T, dark: T) {
  const { colorMode } = useColorMode();
  return colorMode === "dark" ? dark : light;
}

export function ColorModeIcon() {
  const { colorMode } = useColorMode();
  return colorMode === "dark" ? <LuMoon /> : <LuSun />;
}

type ColorModeButtonProps = Omit<IconButtonProps, "aria-label"> & { "aria-label"?: string };

export const ColorModeButton = React.forwardRef<HTMLButtonElement, ColorModeButtonProps>(
  function ColorModeButton(props, ref) {
    const { toggleColorMode } = useColorMode();
    return (
      // Server không biết chế độ hiện tại → chỉ render sau khi hydrate để tránh lệch icon.
      <ClientOnly fallback={<Skeleton boxSize="9" />}>
        <IconButton
          onClick={toggleColorMode}
          variant="ghost"
          aria-label="Toggle color mode"
          size="sm"
          ref={ref}
          {...props}
          css={{ _icon: { width: "5", height: "5" } }}
        >
          <ColorModeIcon />
        </IconButton>
      </ClientOnly>
    );
  },
);

export const LightMode = React.forwardRef<HTMLSpanElement, SpanProps>(
  function LightMode(props, ref) {
    return (
      <Span
        color="fg"
        display="contents"
        className="chakra-theme light"
        colorPalette="gray"
        colorScheme="light"
        ref={ref}
        {...props}
      />
    );
  },
);

export const DarkMode = React.forwardRef<HTMLSpanElement, SpanProps>(function DarkMode(props, ref) {
  return (
    <Span
      color="fg"
      display="contents"
      className="chakra-theme dark"
      colorPalette="gray"
      colorScheme="dark"
      ref={ref}
      {...props}
    />
  );
});
