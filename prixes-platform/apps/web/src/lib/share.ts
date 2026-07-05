import { isNativeApp } from "./platform";

// Share a result using the native share sheet (@capacitor/share in the app, the Web
// Share API in the browser), falling back to copying the link to the clipboard on
// desktop/unsupported browsers.
export async function shareOrCopy(data: {
  title: string;
  text: string;
  url?: string;
}): Promise<"shared" | "copied" | "failed"> {
  const url = data.url ?? (typeof window !== "undefined" ? window.location.href : "");
  const nav = typeof navigator !== "undefined" ? navigator : undefined;

  if (isNativeApp()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: data.title, text: data.text, url });
      return "shared";
    } catch {
      // User cancelled or share unavailable — fall through to clipboard.
    }
  }

  if (nav?.share) {
    try {
      await nav.share({ title: data.title, text: data.text, url });
      return "shared";
    } catch (err) {
      // User dismissed the share sheet — not an error worth surfacing.
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
      // fall through to clipboard
    }
  }

  try {
    await nav?.clipboard?.writeText(`${data.text} ${url}`.trim());
    return "copied";
  } catch {
    return "failed";
  }
}
