"use client";

/**
 * L'offre Premium — opened by a paid feature answering 402, or from the account.
 *
 * Premium is the four features that call a paid model; the page says exactly
 * that, and what stays free, so nobody pays thinking the comparator was locked.
 * Payment happens on Stripe's own page; the account turns Premium when Stripe's
 * webhook says so, not when the browser comes back.
 *
 * In the Android/iOS apps the stores require their own billing for this, which is
 * not wired yet: the apps explain that instead of linking out to a web payment.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { PREMIUM_REQUIRED_EVENT, api } from "@/lib/api";
import { isNativeApp } from "@/lib/platform";
import { useApp } from "@/lib/store";
import { useDialog } from "@/lib/useDialog";

const INCLUDED = [
  { icon: "restaurant_menu", label: "Menus inventés sur mesure", hint: "par l'IA, au-delà de nos recettes" },
  { icon: "auto_awesome", label: "Assistant qui comprend tout", hint: "n'importe quelle phrase devient un panier chiffré" },
  { icon: "photo_camera", label: "Reconnaissance d'un produit sur photo", hint: "quand le code-barres est inconnu" },
  { icon: "record_voice_over", label: "Voix naturelle de l'assistant vocal", hint: "au lieu de la voix du téléphone" },
];

type Plan = "monthly" | "yearly";

export function PremiumModal() {
  const { user, premiumOpen, openPremium, openLogin } = useApp();
  const [plan, setPlan] = useState<Plan>("yearly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read after mount: a capability read during render breaks hydration.
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  useEffect(() => {
    const open = () => openPremium(true);
    window.addEventListener(PREMIUM_REQUIRED_EVENT, open);
    return () => window.removeEventListener(PREMIUM_REQUIRED_EVENT, open);
  }, [openPremium]);
  const dialogRef = useDialog(premiumOpen, () => openPremium(false));

  const { data: status } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api.billingStatus(),
    enabled: premiumOpen && !!user,
  });

  if (!premiumOpen) return null;

  async function subscribe() {
    if (!user) {
      openPremium(false);
      openLogin(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.billingCheckout(plan);
      window.location.href = url;
    } catch {
      setError("Le paiement n'est pas disponible pour le moment. Réessayez plus tard.");
      setBusy(false);
    }
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="premium-title"
      className="fixed inset-0 z-[60] grid place-items-end bg-black/40 backdrop-blur-sm outline-none sm:place-items-center"
      onClick={() => openPremium(false)}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-xl bg-surface-container-lowest p-6 shadow-float sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-primary-container text-on-primary-container">
              <Icon name="workspace_premium" fill className="text-[24px]" />
            </span>
            <div>
              <h2 id="premium-title" className="text-headline-md text-on-surface">
                Prixes Premium
              </h2>
              <p className="text-micro text-on-surface-variant">Les fonctions avec intelligence artificielle</p>
            </div>
          </div>
          <button onClick={() => openPremium(false)} aria-label="Fermer" className="text-on-surface-variant">
            <Icon name="close" />
          </button>
        </div>

        {status?.premium ? (
          <p className="mt-5 rounded-xl bg-primary-container p-4 text-body-md text-on-primary-container">
            <Icon name="check_circle" fill className="mr-1 align-[-4px] text-[18px]" />
            Vous êtes Premium. Merci !
          </p>
        ) : null}

        <ul className="mt-5 space-y-3">
          {INCLUDED.map((f) => (
            <li key={f.label} className="flex gap-3">
              <Icon name={f.icon} className="mt-0.5 text-[22px] text-primary" />
              <span className="text-body-md text-on-surface">
                <span className="block font-semibold">{f.label}</span>
                <span className="text-on-surface-variant">{f.hint}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 rounded-xl bg-surface-container p-3 text-body-md text-on-surface-variant">
          Toujours gratuit : le comparateur, le scanner, le carburant, la liste de courses, les
          alertes prix, <strong className="text-on-surface">les menus de la semaine avec nos recettes</strong>{" "}
          et l&apos;assistant pour les plats de nos recettes.
        </p>

        {!status?.premium &&
          (native ? (
            <p className="mt-5 text-center text-body-md text-on-surface-variant">
              L&apos;abonnement arrive bientôt dans l&apos;application.
            </p>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Formule">
                <PlanOption
                  selected={plan === "monthly"}
                  onClick={() => setPlan("monthly")}
                  title="Mensuel"
                  price="2,99 €"
                  per="par mois"
                />
                <PlanOption
                  selected={plan === "yearly"}
                  onClick={() => setPlan("yearly")}
                  title="Annuel"
                  price="24,99 €"
                  per="par an · 2,08 €/mois"
                  badge="−30 %"
                />
              </div>

              {error && (
                <p role="alert" className="mt-3 text-body-md text-error">
                  {error}
                </p>
              )}

              {status && !status.checkout_available ? (
                <p className="mt-5 text-center text-body-md text-on-surface-variant">
                  Le paiement ouvre très bientôt.
                </p>
              ) : (
                <button
                  onClick={subscribe}
                  disabled={busy}
                  className="btn-primary mt-5 w-full py-3 disabled:opacity-50"
                >
                  <Icon name="lock_open" className="text-[18px]" />
                  {busy ? "Ouverture du paiement…" : user ? "Passer à Premium" : "Se connecter pour s'abonner"}
                </button>
              )}
              <p className="mt-2 text-center text-micro text-on-surface-variant">
                Paiement sécurisé par Stripe · Sans engagement, résiliable à tout moment
              </p>
            </>
          ))}
      </div>
    </div>
  );
}

function PlanOption({
  selected,
  onClick,
  title,
  price,
  per,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  price: string;
  per: string;
  badge?: string;
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`relative rounded-2xl border-2 p-3 text-left transition-colors ${
        selected
          ? "border-primary bg-primary-container text-on-primary-container"
          : "border-outline-variant bg-surface-container-lowest text-on-surface"
      }`}
    >
      {badge && (
        <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-micro text-on-primary">
          {badge}
        </span>
      )}
      <span className="block text-label-md">{title}</span>
      <span className="block text-headline-md">{price}</span>
      <span className="block text-micro opacity-80">{per}</span>
    </button>
  );
}
