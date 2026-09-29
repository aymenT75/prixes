"use client";

/**
 * Says, on screen and to a screen reader, that the network is gone and what
 * still works — and how many list changes wait to be sent. Hidden otherwise.
 */

import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { isOffline, OUTBOX_EVENT, readOutbox } from "@/lib/offline";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);

  // Read in an effect, never during render: the static build would not hydrate.
  useEffect(() => {
    const update = () => {
      setOffline(isOffline());
      setPending(readOutbox().length);
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener(OUTBOX_EVENT, update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener(OUTBOX_EVENT, update);
    };
  }, []);

  if (!offline && pending === 0) return null;
  const waiting = pending > 0 ? `${pending} changement${pending > 1 ? "s" : ""} en attente d'envoi` : "";
  return (
    <div
      role="status"
      aria-live="polite"
      // Just above the tab bar (and clear of the mic that rises out of it): at the
      // top it covered the logo and the account button.
      className="pointer-events-none fixed inset-x-0 bottom-[calc(118px+env(safe-area-inset-bottom))] z-[45] mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-on-surface px-4 py-2 text-label-md font-semibold text-surface shadow-float"
    >
      <Icon name={offline ? "cloud_off" : "cloud_upload"} className="flex-shrink-0" />
      <span>
        {offline ? `Hors connexion${waiting ? ` · ${waiting}` : " · votre liste reste disponible"}` : `Envoi… ${waiting}`}
      </span>
    </div>
  );
}
