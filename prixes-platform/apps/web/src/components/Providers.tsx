"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { flushOutbox } from "@/lib/api";
import { isNativeApp } from "@/lib/platform";
import { logWarn } from "@/lib/logger";
import { useApp } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // "always": offline, React Query would pause every request and the list
          // would never load. The API layer answers from the phone's copy instead
          // (lib/offline), and queues list changes.
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, networkMode: "always" },
          mutations: { networkMode: "always" },
        },
      }),
  );
  const loadMe = useApp((s) => s.loadMe);
  const user = useApp((s) => s.user);

  // Send the changes made offline: once signed in, and each time the network returns.
  useEffect(() => {
    if (!user) return;
    const send = () =>
      void flushOutbox().then((n) => {
        if (n) void client.invalidateQueries({ queryKey: ["shopping"] });
      });
    send();
    window.addEventListener("online", send);
    return () => window.removeEventListener("online", send);
  }, [user, client]);

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
