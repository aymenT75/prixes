"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { isNativeApp } from "@/lib/platform";

// Brand moment on native launch.
//
// Android 12+ replaced the old full-screen splash with a system one that only ever
// draws the app icon on a flat colour — a full-bleed banner is impossible there by
// design. So the banner lives here instead, shown once the web layer paints, right
// after the system splash hands over.
//
// Native only: on the web this would just delay a page the user already asked for.
// aria-hidden + pointer-events-none so it never traps focus or blocks a tap, and the
// whole thing unmounts, leaving nothing behind in the tree.
const VISIBLE_MS = 1100;
const FADE_MS = 400;

export function LaunchBanner() {
  const [monte, setMonte] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    // Paint immediately so there is no gap when the native splash lifts…
    setMonte(true);
    setVisible(true);

    // …but only start counting once it actually has: the WebView boots *behind* the
    // native splash, so a timer started at mount would run out before anyone saw this.
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    const demarrer = () => {
      clearTimeout(t1);
      clearTimeout(t2);
      t1 = setTimeout(() => setVisible(false), VISIBLE_MS);
      t2 = setTimeout(() => setMonte(false), VISIBLE_MS + FADE_MS);
    };

    window.addEventListener("prixes:native-splash-hidden", demarrer, { once: true });
    // Safety net: if that event never fires (plugin missing, hide() threw), the banner
    // must not become a permanent overlay covering the app.
    const secours = setTimeout(demarrer, 4000);

    return () => {
      window.removeEventListener("prixes:native-splash-hidden", demarrer);
      clearTimeout(secours);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!monte) return null;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-[100] grid place-items-center
                  bg-[#dde7e3] transition-opacity duration-[400ms]
                  ${visible ? "opacity-100" : "opacity-0"}`}
    >
      {/* Edge to edge, no padding and no max-width: the banner is 16:9 against a much
          taller screen, so this is as large as it gets without cropping. Filling the
          height with object-cover would keep only the middle ~25% of the width and cut
          off both the wordmark and the outer buttons. */}
      <Image
        src="/launch-banner.webp"
        alt=""
        width={1100}
        height={614}
        priority
        className="w-full select-none object-contain"
      />
    </div>
  );
}
