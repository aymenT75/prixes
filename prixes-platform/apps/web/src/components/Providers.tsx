"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useApp } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
      }),
  );
  const loadMe = useApp((s) => s.loadMe);

  useEffect(() => {
    loadMe();
    // Theme + accessibility settings are initialised by <A11yLayer/> (useA11y.init).
    // Register service worker (PWA)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, [loadMe]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
