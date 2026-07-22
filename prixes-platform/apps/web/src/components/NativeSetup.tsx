"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { isNativeApp, nativePlatform } from "@/lib/platform";
import { initPushNotifications } from "@/lib/push";
import { useApp } from "@/lib/store";

// Native-shell wiring that has no effect on the web build: hides the splash screen
// once the web content is ready, styles the status bar, and maps the Android hardware
// back button to in-app navigation (exiting the app only at the root). All Capacitor
// modules are dynamically imported so they never load in a normal browser.
export function NativeSetup() {
  const router = useRouter();
  const user = useApp((s) => s.user);

  // Register for push notifications once the user is authenticated (registering a
  // device token requires a Bearer token). Tapping a price-alert push deep-links to
  // the product.
  useEffect(() => {
    if (!isNativeApp() || !user) return;
    void initPushNotifications((barcode) =>
      router.push(`/courses/detail?barcode=${barcode}`),
    );
  }, [user, router]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let removeBackListener: (() => void) | undefined;

    (async () => {
      const [{ SplashScreen }, { StatusBar, Style }, { App }] = await Promise.all([
        import("@capacitor/splash-screen"),
        import("@capacitor/status-bar"),
        import("@capacitor/app"),
      ]);

      // Dark icons/text on the app's light background (#faf9f5).
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        if (nativePlatform() === "android") {
          // setBackgroundColor is Android-only.
          await StatusBar.setBackgroundColor({ color: "#faf9f5" });
        }
      } catch {
        /* status bar not available */
      }

      try {
        await SplashScreen.hide();
      } catch {
        /* splash already hidden */
      }
      // The native splash covered the WebView while it booted, so anything that wants
      // to be *seen* at launch has to start counting from here, not from mount.
      // LaunchBanner listens for this.
      window.dispatchEvent(new Event("prixes:native-splash-hidden"));

      try {
        const handle = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack && window.history.length > 1) {
            router.back();
          } else {
            App.exitApp();
          }
        });
        removeBackListener = () => {
          handle.remove();
        };
      } catch {
        /* App plugin not available */
      }
    })();

    return () => removeBackListener?.();
  }, [router]);

  return null;
}
