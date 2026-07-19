// Privacy-light, self-hosted usage analytics. No cookies, no personal data — just a
// random client id (localStorage) so we can count distinct sessions. Honours the
// browser's "Do Not Track" and never throws into the UI.
import { logWarn } from "./logger";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function doNotTrack(): boolean {
  if (typeof navigator === "undefined") return true;
  const dnt =
    navigator.doNotTrack ||
    (window as unknown as { doNotTrack?: string }).doNotTrack;
  return dnt === "1" || dnt === "yes";
}

function sessionId(): string {
  try {
    let id = localStorage.getItem("prixes.sid");
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()) + Math.random().toString(36).slice(2);
      localStorage.setItem("prixes.sid", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function track(event: string, path?: string): void {
  if (typeof window === "undefined" || doNotTrack()) return;
  const body = JSON.stringify({ session_id: sessionId(), event, path });
  try {
    // sendBeacon survives page unloads and never blocks; fall back to fetch.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `${BASE}/api/v1/analytics/event`,
        new Blob([body], { type: "application/json" }),
      );
    } else {
      void fetch(`${BASE}/api/v1/analytics/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch((e) => logWarn("analytics", `Failed to send event: ${e instanceof Error ? e.message : String(e)}`));
    }
  } catch {
    /* analytics must never break the app */
  }
}
