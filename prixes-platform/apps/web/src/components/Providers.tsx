"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { isNativeApp } from "@/lib/platform";
import { logWarn } from "@/lib/logger";
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
    // Register the service worker for the web PWA only. Inside the Capacitor native
    // shell the app is served from bundled assets; a competing SW cache causes
    // stale-asset bugs, so we skip registration there.
    if (!isNativeApp() && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((e) => logWarn("sw", `Service worker registration failed: ${e instanceof Error ? e.message : String(e)}`));
    }
  }, [loadMe]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
