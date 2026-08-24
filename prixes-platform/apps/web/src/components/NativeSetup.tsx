"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { isNativeApp, nativePlatform } from "@/lib/platform";
import { initPushNotifications } from "@/lib/push";
import { useApp } from "@/lib/store";

// Native-shell wiring that has no effect on the web build: styles the status bar and
// maps the Android hardware back button to in-app navigation (exiting the app only at
// the root). All Capacitor modules are dynamically imported so they never load in a
// normal browser. Hiding the native splash belongs to <BootScreen/>, which hands over
// to the in-app boot overlay only once the UI has actually settled.
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
      const [{ StatusBar, Style }, { App }] = await Promise.all([
        import("@capacitor/status-bar"),
        import("@capacitor/app"),
      ]);

      // Dark icons/text on the app's light background.
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        if (nativePlatform() === "android") {
          // setBackgroundColor is Android-only. Matches the boot overlay and the
          // launch screen so the status bar never changes colour mid-startup.
          await StatusBar.setBackgroundColor({ color: "#FDFDFD" });
        }
      } catch {
        /* status bar not available */
      }

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
