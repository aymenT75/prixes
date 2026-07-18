import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Sora } from "next/font/google";

import "./globals.css";
import { A11yLayer } from "@/components/A11yLayer";
import { BottomNav } from "@/components/BottomNav";
import { AuthModal } from "@/components/AuthModal";
import { NativeSetup } from "@/components/NativeSetup";
import { PostDealModal } from "@/components/PostDealModal";
import { ProductTour } from "@/components/ProductTour";
import { Providers } from "@/components/Providers";

// "Vibrant Glass" design system typography: Hanken Grotesk for body text,
// Sora for headlines, JetBrains Mono for small technical/data labels.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-hanken",
});
const sora = Sora({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-sora",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-jetbrains-mono",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${hanken.variable} ${sora.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-on-surface antialiased">
        <Providers>
          <main
            id="contenu"
            className="mx-auto w-full max-w-2xl px-margin-mobile pb-[110px] pt-[calc(env(safe-area-inset-top)+1.5rem)]"
          >
            {children}
          </main>
          <BottomNav />
          <AuthModal />
          <PostDealModal />
          <A11yLayer />
          <NativeSetup />
          <ProductTour />
        </Providers>
      </body>
    </html>
  );
}
