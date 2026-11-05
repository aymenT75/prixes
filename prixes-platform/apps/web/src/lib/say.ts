/**
 * What the app says, and how.
 *
 * Under VoiceOver the app stays silent and hands its words to VoiceOver through
 * a live region: two voices at once understand nothing. Otherwise the phone
 * speaks them. `announce` is for what a screen or an action reports, and honours
 * the "Lire les écrans" setting; `talk` is an answer the person asked for.
 */
import { useEffect } from "react";
import { create } from "zustand";

import { isNativeApp } from "./platform";
import { useA11y } from "./useA11y";
import { speak, stopSpeaking } from "./voice";

export const useLive = create<{ text: string }>(() => ({ text: "" }));

let screenReader = false;

export function screenReaderOn(): boolean {
  return screenReader;
}

/** Follows VoiceOver being turned on or off. Only the native app can know. */
export async function watchScreenReader(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { ScreenReader } = await import("@capacitor/screen-reader");
    screenReader = (await ScreenReader.isEnabled()).value;
    await ScreenReader.addListener("stateChange", ({ value }) => {
      screenReader = value;
      if (value) stopSpeaking();
    });
  } catch {
    /* plugin unavailable: treated as no screen reader */
  }
}

/** An answer: spoken, unless VoiceOver is reading the screen. */
export function talk(text: string, onEnd?: () => void): void {
  if (screenReader) {
    onEnd?.();
    return;
  }
  speak(text, onEnd);
}

/** A report from a screen or an action: to VoiceOver, and aloud if the setting is on. */
export function announce(text: string): void {
  useLive.setState({ text });
  if (!screenReader && useA11y.getState().speakScreens) speak(text);
}

/** Says what a screen shows when it opens, and when that changes. */
export function useSpeakOnOpen(text: string | null): void {
  const ready = useA11y((s) => s.ready);
  const voiceOpen = useA11y((s) => s.voiceOpen);
  useEffect(() => {
    if (!ready || !text || voiceOpen) return;
    announce(text);
    return () => stopSpeaking();
    // Not on voiceOpen: closing the assistant must not repeat the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, text]);
}
