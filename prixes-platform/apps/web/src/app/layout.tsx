import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";
import { A11yLayer } from "@/components/A11yLayer";
import { BootScreen } from "@/components/BootScreen";
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
// with `apply()` and the SCALE_ZOOM table in src/lib/useA11y.ts.
const preHydrationA11y = `(function(){try{
var s=JSON.parse(localStorage.getItem("prixes.a11y")||"{}");
var z=({normal:"1",large:"1.18",xl:"1.38"})[s.fontScale]||"1";
var r=document.documentElement;
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
#prixes-boot .prixes-boot-mark{width:104px;height:104px;border-radius:17.5%;object-fit:cover;
filter:drop-shadow(0 10px 26px rgba(0,17,51,.13));animation:prixes-boot-breathe 1.6s ease-in-out infinite}
html.dark #prixes-boot .prixes-boot-mark{filter:drop-shadow(0 10px 26px rgba(0,0,0,.5))}
#prixes-boot .prixes-boot-track{width:132px;height:4px;border-radius:999px;overflow:hidden;
background:rgba(0,17,51,.10)}
html.dark #prixes-boot .prixes-boot-track{background:rgba(255,255,255,.14)}
#prixes-boot .prixes-boot-track i{display:block;width:40%;height:100%;border-radius:999px;
background:linear-gradient(90deg,#456800,#9AD92E);animation:prixes-boot-slide 1.1s ease-in-out infinite}
#prixes-boot .prixes-boot-label{margin:0;font:500 14px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
letter-spacing:.01em;color:#5A6152}
html.dark #prixes-boot .prixes-boot-label{color:#9AA4B2}
@keyframes prixes-boot-breathe{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.955);opacity:.86}}
@keyframes prixes-boot-slide{0%{transform:translateX(-115%)}100%{transform:translateX(365%)}}
@keyframes prixes-boot-failsafe{to{opacity:0;visibility:hidden}}
@media (prefers-reduced-motion:reduce){
#prixes-boot .prixes-boot-mark{animation:none}
#prixes-boot .prixes-boot-track i{width:100%;animation:none}
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
          {/* Plain <img>: this must render from the raw HTML, before any JS. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="prixes-boot-mark" src="/logo-boot.png" alt="" width={104} height={104} />
          <span className="prixes-boot-track" aria-hidden="true">
            <i />
          </span>
          <p className="prixes-boot-label">Chargement…</p>
        </div>
        <Providers>
          <main
            id="contenu"
            className="mx-auto w-full max-w-2xl px-margin-mobile pb-[110px] pt-[calc(env(safe-area-inset-top)+1.5rem)]"
          >
            {children}
          </main>
          <BottomNav />
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
