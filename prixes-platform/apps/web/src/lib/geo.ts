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
    // Without a timeout a browser that never answers (seen on a desktop Chrome,
    // 12/10) left the home page on « Je compare… » for good. A position from the
    // last 10 minutes is good enough to find the shops around.
    let done = false;
    const guard = setTimeout(() => {
      if (!done) reject(new Error("timeout"));
      done = true;
    }, 15_000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        reject(new Error(err.code === err.PERMISSION_DENIED ? "denied" : "timeout"));
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60_000 },
    );
  });
}
