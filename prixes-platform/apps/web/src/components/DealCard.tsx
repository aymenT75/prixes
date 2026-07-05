"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { eur, timeAgo } from "@/lib/format";
import { shareOrCopy } from "@/lib/share";
import { useApp } from "@/lib/store";
import { useDialog } from "@/lib/useDialog";
import type { Deal } from "@/lib/types";

// The report reasons the backend accepts, with human labels + icons.
const REPORT_REASONS: { value: string; label: string; icon: string }[] = [
  { value: "expired", label: "Expiré / indisponible", icon: "schedule" },
  { value: "wrong_price", label: "Prix incorrect", icon: "sell" },
  { value: "spam", label: "Spam", icon: "block" },
  { value: "abuse", label: "Contenu abusif", icon: "report" },
  { value: "other", label: "Autre raison", icon: "more_horiz" },
];

export function DealCard({ deal }: { deal: Deal }) {
  const qc = useQueryClient();
  const { user, openLogin } = useApp();
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const reportRef = useDialog(reporting, () => setReporting(false));

  const vote = useMutation({
    mutationFn: (value: 1 | -1) => api.voteDeal(deal.id, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  function onVote(value: 1 | -1) {
    if (!user) return openLogin(true);
    if (navigator.vibrate) navigator.vibrate(10);
    vote.mutate(value);
  }

  function onReport() {
    if (!user) return openLogin(true);
    setReporting(true);
  }

  async function submitReport(reason: string) {
    setReporting(false);
    try {
      await api.reportDeal(deal.id, reason);
      setReported(true);
      if (navigator.vibrate) navigator.vibrate(10);
    } catch {
      /* best-effort report — nothing actionable for the user */
    }
  }

  async function onShare() {
    if (navigator.vibrate) navigator.vibrate(10);
    const where = deal.store ? ` chez ${deal.store}` : "";
    await shareOrCopy({
      title: deal.title,
      text: `${deal.title} à ${eur(deal.price_now)}${where} (Prixes)`,
      url: deal.link ?? undefined,
    });
  }

  const temp = deal.votes_up - deal.votes_down;

  // Every deal must lead somewhere: the store's own link when provided, otherwise a
  // Google Shopping search for the item so the card is never a dead end.
  const dest =
    deal.link ??
    `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(
      [deal.title, deal.store].filter(Boolean).join(" "),
    )}`;
  const destLabel = `${deal.title}${deal.store ? `, ${deal.store}` : ""} — ${
    deal.link ? "voir l'offre sur le site du magasin" : "chercher cette offre en ligne"
  } (nouvelle fenêtre)`;

  return (
    <article className="card flex gap-4 p-gutter transition-all hover:shadow-float">
      <a
        href={dest}
        target="_blank"
        rel="noopener noreferrer"
        aria-hidden="true"
        tabIndex={-1}
        className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-surface-container"
      >
        {deal.photo_url ? (
          <Image src={deal.photo_url} alt="" fill className="object-cover" sizes="96px" />
        ) : (
          <div className="flex h-full items-center justify-center text-outline-variant">
            <Icon name="sell" className="text-[32px]" />
          </div>
        )}
        <div className="absolute left-1.5 top-1.5 rounded bg-deal-accent px-1.5 py-0.5 text-micro text-on-deal-accent">
          -{deal.discount_pct}%
        </div>
      </a>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 text-micro text-on-surface-variant">
          {deal.store && <span className="font-bold uppercase tracking-wider text-primary">{deal.store}</span>}
          <span>· {timeAgo(deal.created_at)}</span>
        </div>
        <h3 className="mt-0.5 line-clamp-2 text-label-lg text-on-surface">
          <a
            href={dest}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={destLabel}
            className="hover:underline focus-visible:underline"
          >
            {deal.title}
          </a>
        </h3>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-headline-md text-deal-accent">{eur(deal.price_now)}</span>
          <span className="text-label-md text-on-surface-variant/60 line-through">{eur(deal.price_before)}</span>
        </div>

        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onVote(1)}
              aria-label="C'est un bon plan"
              className="flex items-center gap-1 rounded-full bg-success-light px-2.5 py-1 text-micro text-primary active:scale-90"
            >
              <Icon name="local_fire_department" fill className="text-[14px]" /> {deal.votes_up}
            </button>
            <span className={`text-micro font-bold ${temp >= 0 ? "text-primary" : "text-secondary"}`}>
              {temp >= 0 ? "+" : ""}
              {temp}°
            </span>
            <button
              onClick={() => onVote(-1)}
              aria-label="Ce deal n'est pas intéressant"
              className="flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1 text-micro text-on-surface-variant active:scale-90"
            >
              <Icon name="ac_unit" className="text-[14px]" /> {deal.votes_down}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onShare} className="p-1.5 text-outline-variant active:scale-90" aria-label="Partager">
              <Icon name="ios_share" className="text-[18px]" />
            </button>
            <button
              onClick={onReport}
              disabled={reported}
              className="p-1.5 text-outline-variant active:scale-90 disabled:text-primary disabled:opacity-100"
              aria-label={reported ? "Deal signalé" : "Signaler ce deal"}
              title={reported ? "Deal signalé" : "Signaler ce deal"}
            >
              <Icon name="flag" fill={reported} className="text-[18px]" />
            </button>
            <a
              href={dest}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={deal.link ? "Voir l'offre sur le site du magasin (nouvelle fenêtre)" : "Chercher cette offre en ligne (nouvelle fenêtre)"}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-label-md text-on-primary active:scale-95"
            >
              <Icon name="open_in_new" className="text-[16px]" /> Voir
            </a>
          </div>
        </div>
      </div>

      {reporting && (
        <div
          ref={reportRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Signaler ce deal"
          className="fixed inset-0 z-[60] grid place-items-end bg-black/40 backdrop-blur-sm outline-none sm:place-items-center"
          onClick={() => setReporting(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-surface-container-lowest p-6 pb-10 shadow-float sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-headline-md text-on-surface">Signaler ce deal</h2>
              <button
                onClick={() => setReporting(false)}
                aria-label="Fermer"
                className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high"
              >
                <Icon name="close" />
              </button>
            </div>
            <p className="mb-4 text-body-md text-on-surface-variant">
              Quelle est la raison&nbsp;?
            </p>
            <div className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => submitReport(r.value)}
                  className="flex w-full items-center gap-3 rounded-xl border border-outline-variant/30 p-3 text-left text-label-lg text-on-surface transition-colors hover:border-primary active:scale-[0.99]"
                >
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-container text-primary">
                    <Icon name={r.icon} className="text-[20px]" />
                  </span>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
