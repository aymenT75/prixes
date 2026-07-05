/** @type {import('next').NextConfig} */

// Native (Capacitor) builds are fully static: `output: 'export'` emits a self-contained
// `out/` bundle that ships inside the iOS/Android app and calls the live API over HTTPS.
// Enabled via BUILD_TARGET=mobile (see `npm run build:mobile`). The web deployment keeps
// SSR-style hosting so `headers()` (SW cache-busting) still applies there.
const isMobileBuild = process.env.BUILD_TARGET === "mobile";

const nextConfig = {
  reactStrictMode: true,
  ...(isMobileBuild
    ? { output: "export", trailingSlash: true }
    : {
        async headers() {
          return [
            {
              source: "/sw.js",
              headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
            },
          ];
        },
      }),
  images: {
    // Next's image optimizer needs a running server; a static export can't use it.
    // The app already loads remote images directly, so serving them unoptimized is fine.
    unoptimized: isMobileBuild,
    remotePatterns: [
      { protocol: "https", hostname: "**.openfoodfacts.org" },
      { protocol: "https", hostname: "images.openfoodfacts.org" },
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
