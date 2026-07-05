import { api } from "./api";
import { isNativeApp, nativePlatform } from "./platform";

// Native push notifications (@capacitor/push-notifications). Requests permission,
// obtains the FCM/APNs token and registers it with the backend so the price-alert
// worker can notify this device. Call once the user is authenticated (registering a
// token requires a Bearer token). Re-calling on a new login re-points the token to
// the current user (backend upserts by token).
let listenersReady = false;

export async function initPushNotifications(
  onOpenBarcode?: (barcode: string) => void,
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return;

    if (!listenersReady) {
      listenersReady = true;
      await PushNotifications.addListener("registration", (token) => {
        const platform = nativePlatform();
        void api
          .registerDevice({ token: token.value, platform: platform === "web" ? "web" : platform })
          .catch(() => {
            /* offline / not logged in — will retry on next launch */
          });
      });
      await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const barcode = action.notification?.data?.barcode;
        if (barcode && onOpenBarcode) onOpenBarcode(String(barcode));
      });
    }

    await PushNotifications.register();
  } catch {
    /* push unavailable */
  }
}
