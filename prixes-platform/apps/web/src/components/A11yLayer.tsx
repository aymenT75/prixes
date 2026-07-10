"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { AccessibilityFab } from "@/components/AccessibilityFab";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { track } from "@/lib/analytics";
import { api } from "@/lib/api";
import { useA11y } from "@/lib/useA11y";
import { setNaturalTts, warmUpVoice } from "@/lib/voice";

/** Initialises accessibility settings on load and mounts the floating controls. */
export function A11yLayer() {
  const init = useA11y((s) => s.init);
  const naturalVoice = useA11y((s) => s.naturalVoice);
  const pathname = usePathname();
  useEffect(() => {
    init();
    // Preload the French TTS voice so the first spoken response is instant.
    warmUpVoice();
  }, [init]);

  // Anonymous page-view analytics — reveals which screens are used and where
  // people drop off during user testing (honours Do Not Track).
  useEffect(() => {
    track("pageview", pathname);
  }, [pathname]);

  // The natural (OpenAI) voice is only usable when the backend has a key AND the user
  // has opted in; otherwise `speak()` uses on-device synthesis.
  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => api.meta() });
  useEffect(() => {
    setNaturalTts(!!meta?.tts_enabled && naturalVoice);
  }, [meta?.tts_enabled, naturalVoice]);

  return (
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]
                   focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
      >
        Aller au contenu
      </a>
      <AccessibilityFab />
      <VoiceAssistant />
    </>
  );
}
