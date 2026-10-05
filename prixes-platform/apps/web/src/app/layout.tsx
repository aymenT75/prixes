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
align-items:center;justify-content:center;gap:22px;background:#FDFDFD;
zoom:calc(1 / var(--zoom-scale, 1));opacity:1;transition:opacity 280ms ease-out;
animation:prixes-boot-failsafe 1ms linear 10s forwards}
html.dark #prixes-boot{background:#0D1117}
#prixes-boot[data-hidden="true"]{opacity:0;pointer-events:none}
#prixes-boot .prixes-boot-ticket{position:relative;width:196px;padding-top:9px}
#prixes-boot .prixes-boot-printer{position:absolute;top:0;left:-14px;right:-14px;height:18px;border-radius:9px;
background:#1B1F17;z-index:1}
html.dark #prixes-boot .prixes-boot-printer{background:#3A4330}
#prixes-boot .prixes-boot-paper{position:relative;background:#fff;color:#18200F;padding:14px 14px 10px;
font:500 12.5px/1.85 ui-monospace,"SF Mono",Menlo,Consolas,monospace;
border:1px solid #E3E8DA;border-top:0;box-shadow:0 14px 30px rgba(20,40,0,.16);
clip-path:inset(0 -48px 100% -48px);
animation:prixes-boot-print 1.1s steps(7,end) .1s forwards}
#prixes-boot .prixes-boot-paper b{display:block;text-align:center;font:800 17px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;
color:#3F6400;margin-bottom:4px}
#prixes-boot .prixes-boot-paper span{display:flex;justify-content:space-between;gap:10px}
#prixes-boot .prixes-boot-paper em{font-style:normal}
#prixes-boot .prixes-boot-total{border-top:1px dashed #9AA38E;margin-top:3px;padding-top:3px}
#prixes-boot .prixes-boot-save{color:#2F6B00;font-weight:700}
#prixes-boot .prixes-boot-label{margin:8px 0 0;font:500 14px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
letter-spacing:.01em;color:#4A5142;animation:prixes-boot-blink 1.4s ease-in-out infinite}
html.dark #prixes-boot .prixes-boot-label{color:#9AA4B2}
@keyframes prixes-boot-print{to{clip-path:inset(0 -48px -48px -48px)}}
@keyframes prixes-boot-blink{50%{opacity:.6}}
@keyframes prixes-boot-failsafe{to{opacity:0;visibility:hidden}}
@media (prefers-reduced-motion:reduce){
#prixes-boot .prixes-boot-paper{animation:none;clip-path:none}
#prixes-boot .prixes-boot-label{animation:none}
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
          {/* A till receipt printing line by line, ending on the saving: what the
              app does, told while it loads. Plain HTML and CSS, so it plays from
              the raw page before any script runs. The figures are an illustration. */}
          <div className="prixes-boot-ticket" aria-hidden="true">
            <i className="prixes-boot-printer" />
            <div className="prixes-boot-paper">
              <b>Prixes</b>
              <span><em>Lait</em><em>1,11</em></span>
              <span><em>Pain</em><em>0,89</em></span>
              <span><em>Pâtes</em><em>0,79</em></span>
              <span><em>Tomates</em><em>1,30</em></span>
              <span className="prixes-boot-total"><em>Total</em><em>4,09 €</em></span>
              <span className="prixes-boot-save"><em>Économisé</em><em>−1,20 €</em></span>
            </div>
          </div>
          <p className="prixes-boot-label">Chargement…</p>
        </div>
        {/* First thing in the page, so the first Tab (or VoiceOver swipe) offers it.
            It used to come after the whole app, where a keyboard user met it last. */}
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]
                     focus:rounded-lg focus:bg-gradient-to-r focus:from-primary-fixed-dim focus:to-secondary-fixed-dim focus:px-4 focus:py-2 focus:text-on-primary-fixed"
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
