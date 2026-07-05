import { isNativeApp } from "./platform";

// Scan a barcode using the native ML Kit scanner (@capacitor-mlkit/barcode-scanning).
// Returns the raw value, or null if nothing was scanned (user dismissed). Throws
// Error("denied") if camera permission is refused, or Error("module") if Android's
// Google barcode-scanner module still needs to finish downloading (caller can retry).
export async function scanBarcodeNative(): Promise<string | null> {
  if (!isNativeApp()) return null;
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");

  const perm = await BarcodeScanner.requestPermissions().catch(() => null);
  if (perm && perm.camera !== "granted" && perm.camera !== "limited") {
    throw new Error("denied");
  }

  // Android: the Google barcode-scanner module may need a one-time install. iOS ships
  // the scanner in-app, so these calls are no-ops / throw and are safely ignored.
  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
      // Install completes asynchronously; ask the caller to retry.
      throw new Error("module");
    }
  } catch (e) {
    if (e instanceof Error && e.message === "module") throw e;
    /* module API unavailable (iOS) — fall through to scan() */
  }

  const { barcodes } = await BarcodeScanner.scan();
  return barcodes?.[0]?.rawValue ?? null;
}
