"use client";

import { ChakraProvider } from "@chakra-ui/react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";
import { useState } from "react";
import { system } from "@/theme";

// Registry Emotion cho App Router: gom CSS sinh ra trong lúc SSR và chèn vào <head> qua
// useServerInsertedHTML. cache.compat = true tắt việc Emotion chèn <style> inline giữa thân
// trang (thứ làm cây server/client lệch nhau → lỗi hydration với React 19.3).
function useEmotionRegistry() {
  const [registry] = useState(() => {
    const cache = createCache({ key: "css" });
    cache.compat = true;
    const prevInsert = cache.insert;
    let inserted: string[] = [];
    cache.insert = (...args) => {
      const serialized = args[1];
      if (cache.inserted[serialized.name] === undefined) inserted.push(serialized.name);
      return prevInsert(...args);
    };
    const flush = () => {
      const names = inserted;
      inserted = [];
      return names;
    };
    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const names = registry.flush();
    if (names.length === 0) return null;
    let styles = "";
    for (const name of names) {
      const css = registry.cache.inserted[name];
      if (typeof css === "string") styles += css;
    }
    return (
      <style
        data-emotion={`${registry.cache.key} ${names.join(" ")}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return registry.cache;
}

// Một theme cố định (docs/14), không có color mode.
export function Provider({ children }: { children: React.ReactNode }) {
  const cache = useEmotionRegistry();
  return (
    <CacheProvider value={cache}>
      <ChakraProvider value={system}>{children}</ChakraProvider>
    </CacheProvider>
  );
}
