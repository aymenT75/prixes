"use client";

import { useLive } from "@/lib/say";

/** Where VoiceOver hears what the app reports (see lib/say). Invisible on screen. */
export function LiveRegion() {
  const text = useLive((s) => s.text);
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {text}
    </div>
  );
}
