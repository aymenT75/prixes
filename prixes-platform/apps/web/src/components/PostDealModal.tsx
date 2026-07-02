"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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

export function PostDealModal() {
  const { postModalOpen, openPost, user, openLogin } = useApp();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Only show the photo field when the backend has object storage configured.
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

  async function uploadPhoto(): Promise<string | null> {
    if (!photo) return null;
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

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-end bg-black/40 backdrop-blur-sm sm:place-items-center"
      onClick={() => openPost(false)}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-xl bg-surface-container-lowest p-6 shadow-float sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 text-headline-md text-on-surface">Poster un deal</h2>
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
          {saving > 0 && (
            <p className="text-label-md text-deal-accent">-{saving}% d&apos;économie</p>
          )}
          <input
            className="input"
            placeholder="Lien vers l'offre (optionnel)"
            value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
          />
          {meta?.uploads_enabled && (
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-label-md text-on-surface-variant file:mr-3 file:rounded-full file:border-0 file:bg-surface-container-high file:px-4 file:py-2 file:text-label-md file:text-on-surface"
            />
          )}
          {error && <p className="text-label-md text-error">{error}</p>}
          <button className="btn-primary w-full py-3" disabled={busy}>
            {busy ? "Publication..." : "Publier le deal"}
          </button>
        </form>
      </div>
    </div>
  );
}
