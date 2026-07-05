"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { scanBarcodeNative } from "@/lib/barcode";
import { isNativeApp } from "@/lib/platform";

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => {
      detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
    };
  }
}

// EAN-8 / EAN-13 / UPC-A / UPC-E are 8–14 numeric digits. We validate camera
// detections (not manual entry) so a mis-read never navigates to a junk barcode.
function isPlausibleBarcode(v: string): boolean {
  return /^\d{8,14}$/.test(v);
}

export default function ScannerPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handledRef = useRef(false); // fire navigation exactly once
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState<"idle" | "scanning" | "found" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchable, setTorchable] = useState(false);
  // Resolved after mount so the prerendered (web) markup and the hydrated (native)
  // markup match — avoids a hydration mismatch on the camera UI.
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);

  // Directly open the product as soon as we have a code — the whole point of the
  // scanner. Guarded so overlapping detections can't double-navigate.
  const goToProduct = useCallback(
    (code: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      setStatus("found");
      if (navigator.vibrate) navigator.vibrate(60);
      router.push(`/courses/detail?barcode=${code}`);
    },
    [router],
  );

  // Native (Capacitor) path: open the ML Kit scanner instead of an in-page <video>.
  const nativeScan = useCallback(async () => {
    setStatus("scanning");
    setMessage(null);
    try {
      const code = await scanBarcodeNative();
      if (code && isPlausibleBarcode(code)) {
        goToProduct(code);
      } else {
        // Dismissed without a (plausible) code.
        setStatus("idle");
      }
    } catch (e) {
      setStatus("error");
      setMessage(
        e instanceof Error && e.message === "denied"
          ? "Accès caméra refusé — saisissez le code manuellement."
          : e instanceof Error && e.message === "module"
            ? "Préparation du scanner… réessayez dans un instant."
            : "Scan indisponible — saisissez le code manuellement.",
      );
    }
  }, [goToProduct]);

  useEffect(() => {
    if (native) {
      nativeScan();
      return;
    }
    let cancelled = false;
    let raf = 0;
    // ZXing controls (fallback path) — stopped on cleanup.
    let zxingControls: { stop: () => void } | null = null;

    async function startNative(stream: MediaStream): Promise<boolean> {
      const Detector = window.BarcodeDetector;
      if (!Detector) return false;
      const video = videoRef.current;
      if (!video) return false;
      video.srcObject = stream;
      await video.play().catch(() => {});
      const detector = new Detector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
      });
      const tick = async () => {
        if (cancelled || handledRef.current) return;
        if (video.readyState === 4) {
          const codes = await detector.detect(video).catch(() => []);
          const hit = codes.find((c) => isPlausibleBarcode(c.rawValue));
          if (hit) {
            goToProduct(hit.rawValue);
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return true;
    }

    async function startZxing(): Promise<boolean> {
      const video = videoRef.current;
      if (!video) return false;
      try {
        // Dynamically imported so the ~200KB decoder is only shipped to the
        // browsers that actually need it (iOS Safari, Firefox, desktop Safari).
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        zxingControls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video,
          (result) => {
            if (!result || handledRef.current) return;
            const text = result.getText();
            if (isPlausibleBarcode(text)) goToProduct(text);
          },
        );
        // ZXing owns the stream; grab it so the torch toggle can reach the track.
        if (video.srcObject instanceof MediaStream) {
          streamRef.current = video.srcObject;
          detectTorch(video.srcObject);
        }
        return true;
      } catch {
        return false;
      }
    }

    function detectTorch(stream: MediaStream) {
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
      if (caps?.torch) setTorchable(true);
    }

    async function boot() {
      setStatus("scanning");
      // Fast path: native BarcodeDetector (Android Chrome/Edge) — we own the stream.
      if (window.BarcodeDetector) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
          if (cancelled) return stream.getTracks().forEach((t) => t.stop());
          streamRef.current = stream;
          detectTorch(stream);
          if (await startNative(stream)) return;
        } catch {
          setStatus("error");
          setMessage("Accès caméra refusé — saisissez le code manuellement.");
          return;
        }
      }
      // Fallback: ZXing (iOS Safari, Firefox, desktop Safari).
      if (await startZxing()) return;
      if (!cancelled) {
        setStatus("error");
        setMessage(
          "Scan caméra indisponible sur ce navigateur — saisissez le code manuellement.",
        );
      }
    }

    boot();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      zxingControls?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [goToProduct, native, nativeScan]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      /* torch unsupported on this device */
    }
  }

  return (
    <div>
      <PageHeader title="Scanner" />

      {native ? (
        <button
          onClick={nativeScan}
          className="mb-5 flex h-72 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-outline-variant/40 bg-surface-container-lowest text-primary shadow-card active:scale-[0.99]"
        >
          <Icon
            name={status === "found" ? "check_circle" : "qr_code_scanner"}
            fill
            className="text-[56px]"
          />
          <span className="text-label-lg">
            {status === "scanning" ? "Scanner ouvert…" : "Appuyez pour scanner"}
          </span>
        </button>
      ) : (
        <div className="relative mb-5 overflow-hidden rounded-xl border border-outline-variant/20 bg-black shadow-card">
          <video ref={videoRef} className="h-72 w-full object-cover" muted playsInline autoPlay />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-56 rounded-xl border-2 border-white/70" />
            {status === "scanning" && (
              <div className="absolute h-0.5 w-56 animate-pulse bg-deal-accent" />
            )}
          </div>
          {status === "idle" && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80">
              <Icon name="photo_camera" className="text-[40px]" />
            </div>
          )}
          {status === "found" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
              <Icon name="check_circle" fill className="text-[48px] text-primary" />
            </div>
          )}
          {torchable && (
            <button
              onClick={toggleTorch}
              aria-label="Lampe"
              className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white active:scale-95"
            >
              <Icon name={torchOn ? "flashlight_on" : "flashlight_off"} className="text-[22px]" />
            </button>
          )}
        </div>
      )}

      {status === "scanning" && !native && (
        <p className="mb-4 text-center text-label-md text-on-surface-variant">
          Visez le code-barres du produit…
        </p>
      )}

      {message && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-warning-soft p-3 text-label-md text-secondary">
          <Icon name="info" className="text-[18px]" /> {message}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const code = manual.trim();
          if (code) router.push(`/courses/detail?barcode=${code}`);
        }}
        className="flex items-center gap-2 rounded-full border border-outline-variant/40 bg-surface-container-lowest px-4 py-2.5 shadow-card focus-within:border-primary"
      >
        <Icon name="barcode_scanner" className="text-on-surface-variant" />
        <input
          className="flex-1 bg-transparent text-body-md outline-none"
          inputMode="numeric"
          placeholder="Saisir un code-barres"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <button className="rounded-full bg-primary px-4 py-1.5 text-label-md text-on-primary active:scale-95">
          Chercher
        </button>
      </form>
    </div>
  );
}
