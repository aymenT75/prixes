import { api } from "./api";
import { isNativeApp, nativePlatform } from "./platform";

// Native push notifications (@capacitor/push-notifications). Requests permission,
// obtains the FCM/APNs token and registers it with the backend so the price-alert
// worker can notify this device. Call once the user is authenticated (registering a
// token requires a Bearer token). Re-calling on a new login re-points the token to
// the current user (backend upserts by token).
let listenersReady = false;

const PUSH_TOKEN_KEY = "prixes.push.token";

/**
 * Stop this phone receiving the account's notifications. Called on logout, while
 * the session still exists: without it, the next person to use the phone kept
 * getting the previous account's price drops and menus.
 */
export async function unregisterPush(): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(PUSH_TOKEN_KEY);
    localStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  if (token) await api.unregisterDevice(token).catch(() => {});
}

export async function initPushNotifications(
  onOpenBarcode?: (barcode: string) => void,
  onOpenOther?: (type: string) => void,
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
        // Kept so logging out can unregister this phone (see store.logout).
        try {
          localStorage.setItem(PUSH_TOKEN_KEY, token.value);
        } catch {
          /* ignore */
        }
        const platform = nativePlatform();
        void api
          .registerDevice({ token: token.value, platform: platform === "web" ? "web" : platform })
          .catch(() => {
            /* offline / not logged in — will retry on next launch */
          });
      });
      await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const data = action.notification?.data ?? {};
        const barcode = data.barcode;
        // A list drop or a Sunday menu opens the assistant, which says it.
        if (data.type && data.type !== "price_alert" && onOpenOther) onOpenOther(String(data.type));
        else if (barcode && onOpenBarcode) onOpenBarcode(String(barcode));
      });
    }

    await PushNotifications.register();
  } catch {
    /* push unavailable */
  }
}
