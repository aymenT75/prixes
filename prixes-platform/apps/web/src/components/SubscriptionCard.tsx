"use client";

/**
 * « Mon abonnement » on the account page: Premium or not, until when, and the
 * one button that matters — subscribe, or manage on Stripe's own page.
 *
 * Coming back from Stripe (?abonnement=ok), Premium may not be there yet: it is
 * granted by Stripe's webhook, a few seconds later. The card says so and asks the
 * server again rather than trusting the URL.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";

export function SubscriptionCard() {
  const { openPremium } = useApp();
  const [returned, setReturned] = useState<"ok" | "annule" | null>(null);
  const [busy, setBusy] = useState(false);

  // Read after mount: the page is statically exported, so no search params at build.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("abonnement");
    if (value === "ok" || value === "annule") setReturned(value);
  }, []);

  const { data: status } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api.billingStatus(),
    // Just back from paying and not Premium yet: the webhook is on its way.
    refetchInterval: (query) =>
      returned === "ok" && !query.state.data?.premium && query.state.dataUpdateCount < 10
        ? 3_000
        : false,
  });

  if (!status) return null;

  async function manage() {
    setBusy(true);
    try {
      const { url } = await api.billingPortal();
      window.location.href = url;
    } catch {
      setBusy(false);
    }
  }

  const until = status.premium_until
    ? new Date(status.premium_until).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <section className="card mb-6 p-4" aria-labelledby="subscription-title">
      <div className="flex items-center gap-3">
        <span
          className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-full ${
            status.premium
              ? "bg-primary-container text-on-primary-container"
              : "bg-surface-container text-on-surface-variant"
          }`}
        >
          <Icon name="workspace_premium" fill={status.premium} className="text-[22px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="subscription-title" className="text-label-lg text-on-surface">
            {status.premium ? "Prixes Premium" : "Formule gratuite"}
          </h2>
          <p className="text-body-md text-on-surface-variant">
            {status.premium
              ? until && `Actif, renouvelé le ${until}`
              : "Menus avec nos recettes, comparateur, scanner et liste inclus"}
          </p>
        </div>
      </div>

      {returned === "ok" && !status.premium && (
        <p role="status" className="mt-3 rounded-xl bg-surface-container p-3 text-body-md text-on-surface-variant">
          Paiement reçu, activation en cours…
        </p>
      )}
      {returned === "ok" && status.premium && (
        <p role="status" className="mt-3 rounded-xl bg-primary-container p-3 text-body-md text-on-primary-container">
          Bienvenue dans Premium !
        </p>
      )}

      {status.premium || status.can_manage ? (
        <button
          onClick={manage}
          disabled={busy || !status.can_manage}
          className="btn-outline mt-4 w-full py-2 disabled:opacity-50"
        >
          <Icon name="settings" className="text-[18px]" />
          {busy ? "Ouverture…" : "Gérer mon abonnement"}
        </button>
      ) : null}
      {!status.premium && (
        <button onClick={() => openPremium(true)} className="btn-primary mt-3 w-full py-2">
          <Icon name="lock_open" className="text-[18px]" />
          Découvrir Premium
        </button>
      )}
    </section>
  );
}
