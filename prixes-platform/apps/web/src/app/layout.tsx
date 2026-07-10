import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";
import { A11yLayer } from "@/components/A11yLayer";
import { BottomNav } from "@/components/BottomNav";
import { AuthModal } from "@/components/AuthModal";
import { NativeSetup } from "@/components/NativeSetup";
import { PostDealModal } from "@/components/PostDealModal";
import { Providers } from "@/components/Providers";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "Prixes — Comparez & Partagez",
  description:
    "Comparez les prix des courses et carburants, partagez les meilleures offres. Accessible à tous.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Prixes" },
};

export const viewport: Viewport = {
  themeColor: "#006591",
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom up to 5x — required for low-vision accessibility (WCAG 1.4.4).
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={jakarta.variable} suppressHydrationWarning>
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
        </Providers>
      </body>
    </html>
  );
}
