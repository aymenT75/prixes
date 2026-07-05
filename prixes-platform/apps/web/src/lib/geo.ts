import { isNativeApp } from "./platform";

export interface GeoCoords {
  lat: number;
  lon: number;
}

// Get the device's current position. Uses @capacitor/geolocation (native permission
// prompt) in the app and navigator.geolocation in the browser. Rejects with
// Error("denied") when permission is refused and Error("unsupported") when there is
// no geolocation provider at all.
export async function getCurrentPosition(): Promise<GeoCoords> {
  if (isNativeApp()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    let perm = await Geolocation.checkPermissions().catch(() => null);
    const granted = (p: typeof perm) =>
      !!p && (p.location === "granted" || p.coarseLocation === "granted");
    if (!granted(perm)) {
      perm = await Geolocation.requestPermissions().catch(() => null);
      if (!granted(perm)) throw new Error("denied");
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 10_000,
    });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  }

  return new Promise<GeoCoords>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => reject(new Error("denied")),
    );
  });
}
