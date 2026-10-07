import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";
import { A11yLayer } from "@/components/A11yLayer";
import { BootScreen } from "@/components/BootScreen";
import { OfflineBanner } from "@/components/OfflineBanner";
import { BottomNav } from "@/components/BottomNav";
import { AuthModal } from "@/components/AuthModal";
import { PremiumModal } from "@/components/PremiumModal";
import { NativeSetup } from "@/components/NativeSetup";
import { ProductTour } from "@/components/ProductTour";
import { Providers } from "@/components/Providers";

// "Vibrant Glass" design system typography: Hanken Grotesk for body text,
// Sora for headlines, JetBrains Mono for small technical/data labels.
//
// The three files are committed rather than fetched from Google at build time:
// `next/font/google` downloads them during `next build`, so a network hiccup on a
// CI runner fails the whole build (it broke the iOS workflow on 2026-09-23 with
// "An error occurred in `next/font`"). These are the latin-subset variable fonts,
// the exact files Google was serving; `next/font/local` reads them from disk.
const hanken = localFont({
  src: "./fonts/HankenGrotesk-Variable.woff2",
  weight: "400 800",
  variable: "--font-hanken",
  display: "swap",
});
const sora = localFont({
  src: "./fonts/Sora-Variable.woff2",
  weight: "700 800",
  variable: "--font-sora",
  display: "swap",
});
const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-Variable.woff2",
  weight: "500 600",
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Prixes — Comparez & Partagez",
  description:
    "Comparez les prix des courses, partagez les meilleures offres. Accessible à tous.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Prixes" },
};

export const viewport: Viewport = {
  themeColor: "#0284C7",
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom up to 5x — required for low-vision accessibility (WCAG 1.4.4).
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

// Runs before the first paint: replays the persisted accessibility settings onto
// <html> so the page is already at the right zoom / theme when it is painted,
// instead of jumping when useA11y.init() runs after hydration. Must stay in sync
// with `apply()`, the SCALE_ZOOM table and systemFontScale() in src/lib/useA11y.ts.
const preHydrationA11y = `(function(){try{
var s=JSON.parse(localStorage.getItem("prixes.a11y")||"{}");
var Z={normal:"1",large:"1.18",xl:"1.38"};
var z=Z[s.fontScale]||"1";
var r=document.documentElement;
var p=document.createElement("span");p.style.font="-apple-system-body";
if(p.style.font){r.appendChild(p);var q=parseFloat(getComputedStyle(p).fontSize)/17;p.remove();
var y=q>=1.3?"1.38":q>=1.1?"1.18":"1";if(+y>+z)z=y;}
r.style.zoom=z;
r.style.setProperty("--zoom-scale",z);
if(s.highContrast)r.classList.add("contrast");
if(s.dark===true)r.classList.add("dark");
}catch(e){}})();`;

// The boot overlay (see src/components/BootScreen.tsx). Inlined rather than put in
// globals.css so it is painted with the very first frame, with no stylesheet round
// trip — the whole point is that nothing is ever seen half-assembled.
// The `zoom` here cancels the root zoom above so the overlay always covers exactly
// the viewport, at any accessibility text size.
// The animation is a no-JS failsafe: if the bundle never executes, the overlay
// still clears itself instead of trapping the user behind it.
const bootStyles = `
#prixes-boot{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;
align-items:center;justify-content:center;gap:22px;background:#F7F6F1;overflow:hidden;
zoom:calc(1 / var(--zoom-scale, 1));opacity:1;transition:opacity 220ms ease-out;
animation:prixes-boot-failsafe 1ms linear 10s forwards}
html.dark #prixes-boot{background:#0A0A0B}
#prixes-boot[data-hidden="true"]{opacity:0;pointer-events:none}
#prixes-boot .prixes-boot-car{position:relative;width:min(22vmax,240px);aspect-ratio:1}
#prixes-boot .prixes-boot-body{display:block;width:100%;height:100%;border-radius:22.5%;
box-shadow:0 14px 34px rgba(17,17,17,.18);
animation:prixes-boot-rev .16s linear .25s infinite}
#prixes-boot .prixes-boot-puff{position:absolute;left:-2%;bottom:14%;width:18%;aspect-ratio:1;border-radius:50%;
background:rgba(17,17,17,.16);opacity:0;animation:prixes-boot-puff .9s ease-out .25s infinite}
html.dark #prixes-boot .prixes-boot-puff{background:rgba(246,245,240,.2)}
#prixes-boot .prixes-boot-puff:nth-of-type(2){animation-delay:.55s}
#prixes-boot .prixes-boot-puff:nth-of-type(3){animation-delay:.85s}
#prixes-boot .prixes-boot-line{position:absolute;right:104%;height:5%;border-radius:9px;background:#111111;
width:0;opacity:0}
html.dark #prixes-boot .prixes-boot-line{background:#FFD60A}
#prixes-boot .prixes-boot-line:nth-of-type(4){top:30%}
#prixes-boot .prixes-boot-line:nth-of-type(5){top:50%}
#prixes-boot .prixes-boot-line:nth-of-type(6){top:70%}
#prixes-boot[data-go="true"] .prixes-boot-car{animation:prixes-boot-go .52s cubic-bezier(.55,0,.9,.35) forwards}
#prixes-boot[data-go="true"] .prixes-boot-body{animation:none}
#prixes-boot[data-go="true"] .prixes-boot-line{animation:prixes-boot-streak .52s ease-out forwards}
#prixes-boot[data-go="true"] .prixes-boot-puff{animation:prixes-boot-burst .4s ease-out forwards}
#prixes-boot .prixes-boot-label{margin:0;font:600 14px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
letter-spacing:.02em;color:#4E4D47}
html.dark #prixes-boot .prixes-boot-label{color:#B9B8AF}
#prixes-boot[data-go="true"] .prixes-boot-label{opacity:0;transition:opacity .15s}
@keyframes prixes-boot-rev{0%,100%{transform:none}25%{transform:translate(-1px,-2px) rotate(-.7deg)}
50%{transform:translate(1px,0) rotate(.5deg)}75%{transform:translate(0,-1px) rotate(-.3deg)}}
@keyframes prixes-boot-puff{0%{opacity:.9;transform:translate(0,0) scale(.4)}
100%{opacity:0;transform:translate(-160%,-40%) scale(1.6)}}
@keyframes prixes-boot-burst{0%{opacity:1;transform:scale(.6)}100%{opacity:0;transform:translate(-260%,-20%) scale(2.6)}}
@keyframes prixes-boot-go{0%{transform:none}22%{transform:translateX(-7%) rotate(-6deg)}
100%{transform:translateX(130vw) rotate(-2deg)}}
@keyframes prixes-boot-streak{0%{width:0;opacity:0}30%{width:60%;opacity:.9}100%{width:140%;opacity:0}}
@keyframes prixes-boot-failsafe{to{opacity:0;visibility:hidden}}
@media (prefers-reduced-motion:reduce){
#prixes-boot .prixes-boot-body,#prixes-boot .prixes-boot-puff{animation:none}
#prixes-boot[data-go="true"] .prixes-boot-car,#prixes-boot[data-go="true"] .prixes-boot-line,
#prixes-boot[data-go="true"] .prixes-boot-puff{animation:none}
}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${hanken.variable} ${sora.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: preHydrationA11y }} />
        <style dangerouslySetInnerHTML={{ __html: bootStyles }} />
      </head>
      <body className="min-h-screen bg-background text-on-surface antialiased">
        {/* Covers the app until it is fully laid out — removed by <BootScreen/>. */}
        <div id="prixes-boot" role="status" aria-live="polite" aria-label="Chargement de Prixes">
          {/* The app icon, exactly where the iPhone's launch screen left it, revs
              like an engine while the app loads, then pulls away fast when it is
              ready. Plain HTML and CSS: it plays before any script runs. */}
          <div className="prixes-boot-car" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- painted before React, no loader */}
            <img className="prixes-boot-body" src="/logo-boot.png" alt="" width={240} height={240} />
            <i className="prixes-boot-puff" />
            <i className="prixes-boot-puff" />
            <i className="prixes-boot-puff" />
            <i className="prixes-boot-line" />
            <i className="prixes-boot-line" />
            <i className="prixes-boot-line" />
          </div>
          <p className="prixes-boot-label">Chargement…</p>
        </div>
        {/* First thing in the page, so the first Tab (or VoiceOver swipe) offers it.
            It used to come after the whole app, where a keyboard user met it last. */}
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]
                     focus:rounded-lg focus:bg-primary-container focus:px-4 focus:py-2 focus:text-on-primary-container"
        >
          Aller au contenu
        </a>
        <Providers>
          <main
            id="contenu"
            className="mx-auto w-full max-w-2xl px-margin-mobile pb-[110px] pt-[calc(env(safe-area-inset-top)+1.5rem)]"
          >
            {children}
          </main>
          <BottomNav />
          <OfflineBanner />
          <AuthModal />
          <PremiumModal />
          <A11yLayer />
          <BootScreen />
          <NativeSetup />
          <ProductTour />
        </Providers>
      </body>
    </html>
  );
}
