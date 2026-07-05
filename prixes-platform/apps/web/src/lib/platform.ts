// Runtime detection of the Capacitor native shell (iOS/Android app) vs a normal
// web browser / PWA. Reads the `window.Capacitor` global that Capacitor injects into
// the webview, so it works without importing @capacitor/core and returns false during
// SSR and on the web deployment.
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return cap?.isNativePlatform?.() ?? false;
}

// Best-effort platform label for analytics / plugin branching.
export function nativePlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  const cap = (window as unknown as {
    Capacitor?: { getPlatform?: () => string };
  }).Capacitor;
  const p = cap?.getPlatform?.();
  return p === "ios" || p === "android" ? p : "web";
}
