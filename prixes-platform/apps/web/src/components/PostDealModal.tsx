"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";

const EMPTY = {
  title: "",
  store: "",
  category: "",
  price_now: "",
  price_before: "",
  link: "",
  description: "",
};

type Recog = { status: "idle" | "working" | "ok" | "info"; msg: string };

// Detect an EAN/UPC barcode in a photo using ZXing (lazy-loaded).
async function detectBarcode(file: File): Promise<string | null> {
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

// Downscale to keep the AI payload (and cost) small.
function downscaleToBase64(file: File, maxDim = 1024): Promise<string> {
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

export function PostDealModal() {
  const { postModalOpen, openPost, user, openLogin } = useApp();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [photo, setPhoto] = useState<File | null>(null);
  const [recog, setRecog] = useState<Recog>({ status: "idle", msg: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () => api.meta(),
    staleTime: 5 * 60_000,
  });

  if (!postModalOpen) return null;
  if (!user) {
    openPost(false);
    openLogin(true);
    return null;
  }

  async function onPhotoPick(file: File) {
    setPhoto(file); // also used as the deal image if object storage is enabled
    setError(null);
    setRecog({ status: "working", msg: "Analyse de la photo…" });

    // 1) Barcode first (free, offline, precise).
    const barcode = await detectBarcode(file);
    if (barcode) {
      try {
        const p = await api.getProduct(barcode);
        setForm((f) => ({
          ...f,
          title: p.name ?? f.title,
          category: p.categories?.split(",")[0]?.trim() ?? f.category,
        }));
        setRecog({ status: "ok", msg: `Produit reconnu : ${p.name ?? barcode}` });
        return;
      } catch {
        /* barcode found but product unknown — fall through to AI */
      }
    }

    // 2) AI vision fallback (needs a server key).
    try {
      const b64 = await downscaleToBase64(file);
      const r = await api.recognizeDeal(b64, "image/jpeg");
      if (!r.available) {
        setRecog({
          status: "info",
          msg: "Reconnaissance IA non activée sur le serveur — saisissez le titre.",
        });
      } else if (r.product_name) {
        setForm((f) => ({ ...f, title: [r.product_name, r.brand].filter(Boolean).join(" ") }));
        setRecog({ status: "ok", msg: `Reconnu par IA : ${r.product_name}` });
      } else {
        setRecog({ status: "info", msg: "Produit non reconnu — saisissez le titre." });
      }
    } catch {
      setRecog({ status: "info", msg: "Échec de la reconnaissance — saisissez le titre." });
    }
  }

  async function uploadPhoto(): Promise<string | null> {
    if (!photo || !meta?.uploads_enabled) return null;
    const { upload_url, public_url } = await api.presign(photo.type);
    await fetch(upload_url, { method: "PUT", headers: { "Content-Type": photo.type }, body: photo });
    return public_url;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const photo_url = await uploadPhoto();
      await api.createDeal({
        title: form.title,
        store: form.store || null,
        category: form.category || null,
        description: form.description || null,
        price_now: Number(form.price_now),
        price_before: Number(form.price_before),
        link: form.link || null,
        photo_url,
      });
      await qc.invalidateQueries({ queryKey: ["deals"] });
      setForm(EMPTY);
      setPhoto(null);
      setRecog({ status: "idle", msg: "" });
      openPost(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const saving =
    form.price_now && form.price_before && Number(form.price_before) > Number(form.price_now)
      ? Math.round(
          ((Number(form.price_before) - Number(form.price_now)) / Number(form.price_before)) * 100,
        )
      : 0;

  const recogColor =
    recog.status === "ok"
      ? "text-primary"
      : recog.status === "working"
        ? "text-on-surface-variant"
        : "text-secondary";

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-end bg-black/40 backdrop-blur-sm sm:place-items-center"
      onClick={() => openPost(false)}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-xl bg-surface-container-lowest p-6 shadow-float sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-headline-md text-on-surface">Poster un deal</h2>

        {/* Photo recognition */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPhotoPick(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={recog.status === "working"}
          className="mb-2 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-left active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
            <Icon name={recog.status === "working" ? "hourglass_top" : "photo_camera"} className="text-[24px]" />
          </span>
          <span>
            <span className="block text-label-lg text-on-surface">
              {recog.status === "working" ? "Analyse…" : "Prendre une photo du produit"}
            </span>
            <span className="block text-micro text-on-surface-variant">
              Reconnaissance par code-barres, sinon par IA
            </span>
          </span>
        </button>
        {recog.msg && <p className={`mb-3 text-label-md ${recogColor}`}>{recog.msg}</p>}

        <form onSubmit={submit} className="space-y-3">
          <input
            className="input"
            placeholder="Titre du deal (ex: Nutella 750g)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            minLength={4}
          />
          <input
            className="input"
            placeholder="Enseigne (Carrefour, Lidl...)"
            value={form.store}
            onChange={(e) => setForm({ ...form, store: e.target.value })}
          />
          <div className="flex gap-3">
            <input
              className="input"
              type="number"
              step="0.01"
              placeholder="Prix réduit €"
              value={form.price_now}
              onChange={(e) => setForm({ ...form, price_now: e.target.value })}
              required
            />
            <input
              className="input"
              type="number"
              step="0.01"
              placeholder="Prix habituel €"
              value={form.price_before}
              onChange={(e) => setForm({ ...form, price_before: e.target.value })}
              required
            />
          </div>
          {saving > 0 && <p className="text-label-md text-deal-accent">-{saving}% d&apos;économie</p>}
          <input
            className="input"
            placeholder="Lien vers l'offre (optionnel)"
            value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
          />
          {error && <p className="text-label-md text-error">{error}</p>}
          <button className="btn-primary w-full py-3" disabled={busy}>
            {busy ? "Publication..." : "Publier le deal"}
          </button>
        </form>
      </div>
    </div>
  );
}
