// Shared photo helpers for AI product recognition (scanner "identify by photo" +
// deal poster). Barcode is tried first (offline, instant); the downscaled image is
// only sent to the vision API when no barcode is found — keeps latency + cost low.

/** Detect an EAN/UPC barcode in a photo using ZXing (lazy-loaded ~200 KB). */
export async function detectBarcodeInFile(file: File): Promise<string | null> {
  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const reader = new BrowserMultiFormatReader();
    const url = URL.createObjectURL(file);
    try {
      const result = await reader.decodeFromImageUrl(url);
      const text = result.getText();
      return /^\d{8,14}$/.test(text) ? text : null;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/** Downscale an image to keep the vision payload (and latency) small; returns
 *  base64 without the data-URL prefix. maxDim 768 is plenty for GPT-4o to read a label. */
export function downscaleToBase64(file: File, maxDim = 768): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no ctx"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = reject;
    img.src = url;
  });
}
