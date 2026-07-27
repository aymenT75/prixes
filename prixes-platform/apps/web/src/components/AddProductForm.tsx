"use client";

import { useState } from "react";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { downscaleToBase64 } from "@/lib/vision";

// Shown when a scanned barcode isn't in our catalog (typically a store-internal code
// absent from OpenFoodFacts). Turns the dead-end "Produit introuvable" into an action:
// snap a photo, let the AI name it, confirm, and the product is created and opened.
export function AddProductForm({
  barcode,
  onCreated,
}: {
  barcode: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [recognizing, setRecognizing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recogniseFromFile(file: File) {
    setRecognizing(true);
    setHint(null);
    try {
      const b64 = await downscaleToBase64(file);
      const r = await api.recognizeProduct(b64, "image/jpeg");
      if (!r.available) {
        setHint("Reconnaissance IA indisponible — saisissez le nom.");
      } else if (r.product_name) {
        setName(r.product_name);
        if (r.brand) setBrand(r.brand);
        setHint(`Reconnu : ${r.product_name}`);
      } else {
        setHint("Produit non reconnu — saisissez le nom.");
      }
    } catch {
      setHint("Échec de la reconnaissance — saisissez le nom.");
    } finally {
      setRecognizing(false);
    }
  }

  async function takePhoto() {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const shot = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
        quality: 85,
      });
      if (!shot.webPath) return;
      const blob = await (await fetch(shot.webPath)).blob();
      await recogniseFromFile(new File([blob], "produit.jpg", { type: blob.type || "image/jpeg" }));
    } catch {
      /* cancelled or camera unavailable — manual entry still works */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createProduct({ barcode, name: name.trim(), brand: brand.trim() || undefined });
      onCreated();
    } catch {
      setError("Impossible d'ajouter le produit. Réessayez.");
      setBusy(false);
    }
  }

  return (
    <section className="card mx-auto mt-6 max-w-md p-5">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="add_a_photo" className="text-primary" />
        <h3 className="text-headline-md text-on-surface">Ajouter ce produit</h3>
      </div>
      <p className="mb-4 text-body-md text-on-surface-variant">
        Ce produit n&apos;est pas encore dans notre base. Prenez-le en photo pour le
        reconnaître, ou saisissez son nom.
      </p>

      <p className="mb-4 rounded-lg bg-surface-container-high px-3 py-2 text-micro text-on-surface-variant">
        Code-barres&nbsp;: <span className="font-bold text-on-surface">{barcode}</span>
      </p>

      <button
        type="button"
        onClick={takePhoto}
        disabled={recognizing || busy}
        className="btn-outline mb-4 w-full py-3"
      >
        <Icon name="photo_camera" className="text-[20px]" />
        {recognizing ? "Reconnaissance…" : "Prendre une photo"}
      </button>

      {hint && <p className="mb-3 text-micro text-on-surface-variant">{hint}</p>}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          className="input"
          placeholder="Nom du produit"
          aria-label="Nom du produit"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="input"
          placeholder="Marque (facultatif)"
          aria-label="Marque"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        />
        {error && <p className="text-body-md text-error">{error}</p>}
        <button className="btn-primary py-3" disabled={busy || !name.trim()}>
          <Icon name="check" className="text-[18px]" /> {busy ? "Ajout…" : "Ajouter le produit"}
        </button>
      </form>
    </section>
  );
}
