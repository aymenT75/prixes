"use client";

import { useEffect, useState } from "react";

import { isNativeApp } from "@/lib/platform";
import { useApp } from "@/lib/store";
import { useA11y } from "@/lib/useA11y";

// Dismisses the boot overlay that `layout.tsx` renders straight into the HTML.
//
// Why the overlay exists: this is a static export, so the first paint is the
// prerendered markup — before hydration the accessibility zoom, the dark/contrast
// theme and the web fonts are not applied yet, and the auth state is unknown, so
// the UI visibly jumps into place a beat after it appears (worst inside the
// Android WebView, where the native splash used to disappear mid-jump). The
// overlay hides that whole settling phase; this component takes it away only once
// the app is genuinely laid out.
const BOOT_ID = "prixes-boot";
// Keep in sync with the fade duration in the overlay's inline CSS (layout.tsx).
const FADE_MS = 280;
// A loader that flashes for 80ms reads as a glitch — hold it briefly.
const MIN_VISIBLE_MS = 300;
// Never trap the user behind the loader because one signal never settles.
const FAILSAFE_MS = 6000;
// Web fonts are bundled, so they resolve in a few ms — but document.fonts.ready
// waits on *every* face, and one slow or unreachable one must not hold the app
// hostage. Past this point a font swap is a smaller evil than a stuck loader.
const FONTS_MAX_WAIT_MS = 1200;

let dismissed = false;

function hideNativeSplash() {
  if (!isNativeApp()) return;
  void import("@capacitor/splash-screen")
    .then(({ SplashScreen }) => SplashScreen.hide())
    .catch(() => {
      /* splash already hidden, or plugin unavailable */
    });
}

function dismissBoot() {
  if (dismissed) return;
  dismissed = true;
  const el = document.getElementById(BOOT_ID);
  // performance.now() is measured from navigation start, so this is the real age
  // of the overlay, not the age of this chunk.
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
  window.setTimeout(() => {
    hideNativeSplash();
    if (!el) return;
    el.setAttribute("data-hidden", "true");
    // Hide, never remove: the overlay is rendered by layout.tsx, so it is a React
    // -owned child of <body>. Detaching it behind React's back leaves a stale
    // fiber, and the next commit that touches <body> throws NotFoundError
    // ("insertBefore"/"removeChild"), which the error boundary turns into the
    // full-screen "Une erreur critique est survenue" on an ordinary tab change.
    window.setTimeout(() => {
      el.style.display = "none";
    }, FADE_MS);
  }, wait);
}

export function BootScreen() {
  // `loading` starts true and flips once loadMe() has settled (token or no token).
  const authSettled = useApp((s) => !s.loading);
  // Flips in useA11y.init(), i.e. once zoom / dark / contrast are on <html>.
  const a11yReady = useA11y((s) => s.ready);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let live = true;
    const done = () => {
      if (live) setFontsReady(true);
    };
    const cap = window.setTimeout(done, FONTS_MAX_WAIT_MS);
    document.fonts?.ready.then(done, done) ?? done();
    return () => {
      live = false;
      window.clearTimeout(cap);
    };
  }, []);

  useEffect(() => {
    const id = window.setTimeout(dismissBoot, FAILSAFE_MS);
    return () => window.clearTimeout(id);
  }, []);

  const ready = authSettled && a11yReady && fontsReady;

  useEffect(() => {
    if (!ready) return;
    // Two frames: let React paint the hydrated tree — with the final zoom, theme
    // and fonts — before uncovering it, so nothing moves once it is visible.
    const raf = requestAnimationFrame(() => requestAnimationFrame(dismissBoot));
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  return null;
}
