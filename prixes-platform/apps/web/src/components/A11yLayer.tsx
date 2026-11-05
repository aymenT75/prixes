"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { VoiceAssistant } from "@/components/VoiceAssistant";
import { track } from "@/lib/analytics";
import { api } from "@/lib/api";
import { watchScreenReader } from "@/lib/say";
import { useA11y } from "@/lib/useA11y";
import { setNaturalTts, warmUpVoice } from "@/lib/voice";

/** Initialises accessibility settings on load and mounts the voice assistant. */
export function A11yLayer() {
  const init = useA11y((s) => s.init);
  const naturalVoice = useA11y((s) => s.naturalVoice);
  const pathname = usePathname();
  useEffect(() => {
    init();
    // Preload the French TTS voice so the first spoken response is instant.
    warmUpVoice();
    void watchScreenReader();
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

  return <VoiceAssistant />;
}
