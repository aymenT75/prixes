"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { eur, timeAgo } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { Deal } from "@/lib/types";

export function DealCard({ deal }: { deal: Deal }) {
  const qc = useQueryClient();
  const { user, openLogin } = useApp();

  const vote = useMutation({
    mutationFn: (value: 1 | -1) => api.voteDeal(deal.id, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  function onVote(value: 1 | -1) {
    if (!user) return openLogin(true);
    if (navigator.vibrate) navigator.vibrate(10);
    vote.mutate(value);
  }

  async function onReport() {
    if (!user) return openLogin(true);
    const reason = prompt("Signaler (spam, expired, wrong_price, abuse, other) :", "expired");
    if (reason) {
      await api.reportDeal(deal.id, reason);
      alert("Merci, le deal a été signalé.");
    }
  }

  const temp = deal.votes_up - deal.votes_down;

  return (
    <article className="card flex gap-4 p-gutter transition-all hover:shadow-float">
      <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-surface-container">
        {deal.photo_url ? (
          <Image src={deal.photo_url} alt={deal.title} fill className="object-cover" sizes="96px" />
        ) : (
          <div className="flex h-full items-center justify-center text-outline-variant">
            <Icon name="sell" className="text-[32px]" />
          </div>
        )}
        <div className="absolute left-1.5 top-1.5 rounded bg-deal-accent px-1.5 py-0.5 text-micro text-white">
          -{deal.discount_pct}%
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 text-micro text-on-surface-variant">
          {deal.store && <span className="font-bold uppercase tracking-wider text-primary">{deal.store}</span>}
          <span>· {timeAgo(deal.created_at)}</span>
        </div>
        <h3 className="mt-0.5 truncate text-label-lg text-on-surface">{deal.title}</h3>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-headline-md text-deal-accent">{eur(deal.price_now)}</span>
          <span className="text-label-md text-on-surface-variant/60 line-through">{eur(deal.price_before)}</span>
        </div>

        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onVote(1)}
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
              className="flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1 text-micro text-on-surface-variant active:scale-90"
            >
              <Icon name="ac_unit" className="text-[14px]" /> {deal.votes_down}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onReport} className="p-1.5 text-outline-variant active:scale-90" aria-label="Signaler">
              <Icon name="flag" className="text-[18px]" />
            </button>
            {deal.link && (
              <a
                href={deal.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-label-md text-on-primary active:scale-95"
              >
                <Icon name="open_in_new" className="text-[16px]" /> Voir
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
