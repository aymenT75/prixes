"use client";

import { useEffect } from "react";

import { AccessibilityFab } from "@/components/AccessibilityFab";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { useA11y } from "@/lib/useA11y";
import { warmUpVoice } from "@/lib/voice";

/** Initialises accessibility settings on load and mounts the floating controls. */
export function A11yLayer() {
  const init = useA11y((s) => s.init);
  useEffect(() => {
    init();
    // Preload the French TTS voice so the first spoken response is instant.
    warmUpVoice();
  }, [init]);

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
