"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { PriceChart } from "@/components/PriceChart";
import { ProductCard } from "@/components/ProductCard";
import { NovaBadge, ScoreBadge } from "@/components/ScoreBadge";
import { api } from "@/lib/api";
import { eur } from "@/lib/format";
import { shareOrCopy } from "@/lib/share";
import { useApp } from "@/lib/store";
import { useA11y } from "@/lib/useA11y";
import { hapticDanger, hapticSuccess, speak } from "@/lib/voice";

function parseAllergens(s: string | null): string[] {
  return (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

// The product barcode is passed as a query param (?barcode=…) rather than a route
// segment so the page works under Next.js `output: 'export'` (static export has no
// server to resolve unbounded dynamic segments). Client-side navigation is unchanged.
export default function ProductDetailPage() {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="Produit" back />
          <p className="py-10 text-center text-on-surface-variant">Chargement…</p>
        </div>
      }
    >
      <ProductDetail />
    </Suspense>
  );
}

function ProductDetail() {
  const barcode = useSearchParams().get("barcode") ?? "";
  const qc = useQueryClient();
  const { user, openLogin } = useApp();
  const { allergens: profile, diets: dietProfile, autoRead } = useA11y();
  const [store, setStore] = useState("");
  const [price, setPrice] = useState("");
  const [listMsg, setListMsg] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const announcedRef = useRef<string | null>(null);

  async function shareResult() {
    if (!data) return;
    const price =
      data.best_price != null
        ? ` — meilleur prix ${eur(data.best_price)}${
            data.best_unit_price != null ? ` (${eur(data.best_unit_price)} ${data.unit_label})` : ""
          }`
        : "";
    const res = await shareOrCopy({
      title: data.name ?? "Prixes",
      text: `${data.name ?? "Ce produit"}${price} sur Prixes`,
    });
    if (res !== "failed") {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  }

  const addToList = useMutation({
    mutationFn: () => api.addToList({ barcode }),
    onSuccess: () => {
      setListMsg("Ajouté à votre liste ✓");
      hapticSuccess();
      speak("Ajouté à votre liste.");
      qc.invalidateQueries({ queryKey: ["shopping"] });
    },
    onError: () => {
      setListMsg("Erreur — réessayez.");
      hapticDanger();
    },
  });

  const createAlert = useMutation({
    mutationFn: (target: number | null) => api.createAlert({ barcode, target_price: target }),
    onSuccess: () => {
      setAlertMsg("Alerte activée ✓");
      hapticSuccess();
      speak("Alerte activée. Vous serez prévenu à la prochaine baisse.");
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: () => {
      setAlertMsg("Erreur — réessayez.");
      hapticDanger();
    },
  });

  function onAddToList() {
    if (!user) return openLogin(true);
    addToList.mutate();
  }

  function onCreateAlert() {
    if (!user) return openLogin(true);
    // Cognitive simplicity + voice-first: one tap arms an alert on any future drop,
    // no prompt to read or type. (Target-price alerts stay available via voice search.)
    createAlert.mutate(null);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["product", barcode],
    queryFn: () => api.getProduct(barcode),
    enabled: barcode.length > 0,
  });

  const { data: history } = useQuery({
    queryKey: ["product-history", barcode],
    queryFn: () => api.getPriceHistory(barcode),
    enabled: !!data,
  });

  const { data: alternatives } = useQuery({
    queryKey: ["product-alternatives", barcode],
    queryFn: () => api.getAlternatives(barcode),
    enabled: !!data,
  });

  const dietList = parseAllergens(data?.diets ?? null);
  const allergenList = parseAllergens(data?.allergens ?? null);
  const allergenMatches = allergenList.filter((a) =>
    profile.some(
      (p) => a.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(a.toLowerCase()),
    ),
  );

  // Cheapest same-category alternative that undercuts this product's best price.
  const cheaperAlt = useMemo(() => {
    if (!data || data.best_price == null || !alternatives) return null;
    const under = alternatives.items
      .filter((a) => a.best_price != null && a.best_price < data.best_price!)
      .sort((x, y) => x.best_price! - y.best_price!);
    return under[0] ?? null;
  }, [data, alternatives]);

  // Voice-first announcement on open (right after a scan). Priority order:
  //  1) SAFETY — matching allergens are spoken FIRST + danger haptic, and this fires
  //     even when auto-read is off; we never wait on the alternatives query for it.
  //  2) When auto-read is on, a CONCISE line: "Nom, prix, [moins cher : alternative]".
  // Spoken as a single utterance so the order is guaranteed and there is no
  // cancel-race between two speak() calls (also the lowest-latency path).
  useEffect(() => {
    if (!data || announcedRef.current === barcode) return;
    const hasAllergen = allergenMatches.length > 0;
    // Wait for the alternatives query only to enrich the spoken price comparison —
    // but a safety alert must never be delayed.
    if (autoRead && !hasAllergen && alternatives === undefined) return;
    announcedRef.current = barcode;

    const parts: string[] = [];
    if (hasAllergen) parts.push(`Attention, ce produit contient ${allergenMatches.join(", ")}.`);
    if (autoRead) {
      const price = data.best_price != null ? ` à ${eur(data.best_price)}` : "";
      let line = `${data.name ?? "Produit"}${price}.`;
      if (cheaperAlt?.best_price != null) {
        line += ` Moins cher : ${cheaperAlt.name} à ${eur(cheaperAlt.best_price)}.`;
      }
      parts.push(line);
    }
    if (parts.length) speak(parts.join(" "));
    // Haptic confirmation of the scan: danger buzz if allergen, success buzz otherwise.
    if (hasAllergen) hapticDanger();
    else hapticSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, alternatives, autoRead, barcode, allergenMatches.length, cheaperAlt]);

  async function contribute(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return openLogin(true);
    await api.contributePrice(barcode, { store, price: Number(price) });
    setStore("");
    setPrice("");
    await qc.invalidateQueries({ queryKey: ["product", barcode] });
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Produit" back />
        <p className="py-10 text-center text-on-surface-variant">Chargement…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <PageHeader title="Produit" back />
        <p className="py-10 text-center text-error">Produit introuvable.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Produit"
        back
        action={
          <button
            onClick={shareResult}
            aria-label="Partager ce produit"
            className="flex h-10 w-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-container-high active:scale-95"
          >
            <Icon name={shared ? "check" : "ios_share"} className="text-[22px]" />
          </button>
        }
      />

      {/* Hero */}
      <section className="mb-6 flex flex-col items-center">
        <div className="relative mb-4 flex h-44 w-44 items-center justify-center overflow-hidden rounded-xl border border-outline-variant/20 bg-white shadow-float">
          {data.image_url ? (
            <Image src={data.image_url} alt={data.name ?? ""} fill className="object-contain p-4" sizes="176px" />
          ) : (
            <Icon name="grocery" className="text-[48px] text-outline-variant" />
          )}
          {data.quantity && (
            <span className="absolute right-3 top-3 rounded-full bg-primary px-2 py-1 text-micro text-on-primary">
              {data.quantity}
            </span>
          )}
        </div>
        <h2 className="text-center text-headline-lg text-on-surface">{data.name}</h2>
        {data.brand && <p className="text-body-md text-on-surface-variant">{data.brand}</p>}
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          <ScoreBadge kind="Nutri" grade={data.nutriscore} />
          <ScoreBadge kind="Eco" grade={data.ecoscore} />
          <NovaBadge group={data.nova_group} />
        </div>
      </section>

      {/* Quick actions */}
      <section className="mb-6 grid grid-cols-2 gap-gutter">
        <button
          onClick={onAddToList}
          disabled={addToList.isPending}
          className="btn-outline flex-col gap-1 py-3"
        >
          <Icon name="add_shopping_cart" className="text-[22px]" />
          <span className="text-label-md">{listMsg ?? "Ajouter à ma liste"}</span>
        </button>
        <button
          onClick={onCreateAlert}
          disabled={createAlert.isPending}
          className="btn-outline flex-col gap-1 py-3"
        >
          <Icon name="notifications_active" className="text-[22px]" />
          <span className="text-label-md">{alertMsg ?? "M'alerter si baisse"}</span>
        </button>
      </section>

      {/* Allergens — safety-critical, shown prominently */}
      <section className="mb-6" aria-label="Allergènes" data-speak>
        {allergenMatches.length > 0 && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-3 rounded-xl border-2 border-error bg-error-container p-4 text-on-error-container"
          >
            <Icon name="warning" fill className="mt-0.5 text-[28px] text-error" />
            <div>
              <p className="text-label-lg font-bold">Attention — vos allergènes</p>
              <p className="text-body-md">
                Ce produit contient&nbsp;: <strong>{allergenMatches.join(", ")}</strong>.
              </p>
            </div>
          </div>
        )}
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="health_and_safety" className="text-primary" />
            <h3 className="text-headline-md text-on-surface">Allergènes</h3>
          </div>
          {data.allergens == null ? (
            <p className="text-body-md text-on-surface-variant">Information en cours de chargement…</p>
          ) : allergenList.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">Aucun allergène déclaré.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allergenList.map((a) => {
                const danger = allergenMatches.includes(a);
                return (
                  <span
                    key={a}
                    className={`chip text-label-md ${
                      danger
                        ? "border-2 border-error bg-error-container font-bold text-on-error-container"
                        : "bg-surface-container-high text-on-surface"
                    }`}
                  >
                    {danger && <Icon name="warning" className="mr-1 text-[16px] text-error" />}
                    {a}
                  </span>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-micro text-on-surface-variant">
            Source OpenFoodFacts. En cas de doute, vérifiez l&apos;emballage.
          </p>
        </div>
      </section>

      {/* Dietary regime */}
      {(dietList.length > 0 || dietProfile.length > 0) && (
        <section className="card mb-6 p-4" aria-label="Régime alimentaire" data-speak>
          <div className="mb-2 flex items-center gap-2">
            <Icon name="restaurant" className="text-primary" />
            <h3 className="text-headline-md text-on-surface">Régime alimentaire</h3>
          </div>

          {dietList.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {dietList.map((d) => (
                <span
                  key={d}
                  className="chip flex items-center gap-1 bg-primary/10 text-label-md font-bold text-primary"
                >
                  <Icon name="check_circle" fill className="text-[16px]" />
                  {d}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-body-md text-on-surface-variant">
              Aucune information de régime déclarée pour ce produit.
            </p>
          )}

          {/* Compatibility with the user's chosen regimes */}
          {dietProfile.length > 0 && (
            <ul className="mt-2 space-y-1">
              {dietProfile.map((d) => {
                const ok = dietList.includes(d);
                return (
                  <li key={d} className="flex items-center gap-2 text-body-md">
                    <Icon
                      name={ok ? "check_circle" : "help"}
                      fill={ok}
                      className={ok ? "text-primary" : "text-outline"}
                    />
                    <span className={ok ? "text-on-surface" : "text-on-surface-variant"}>
                      {ok ? `Compatible : ${d}` : `${d} : non confirmé`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Best price banner */}
      {data.best_price != null && (
        <section className="relative mb-6 flex items-center justify-between overflow-hidden rounded-xl bg-primary-container p-6 text-on-primary-container shadow-float">
          <div className="absolute -bottom-4 -right-4 opacity-10">
            <Icon name="local_offer" className="text-[110px]" />
          </div>
          <div className="relative z-10">
            <p className="mb-1 text-micro uppercase tracking-widest opacity-90">Meilleur prix</p>
            <span className="text-headline-xl">{eur(data.best_price)}</span>
            {data.best_unit_price != null && (
              <p className="mt-1 text-label-md opacity-90">
                {eur(data.best_unit_price)} {data.unit_label}
              </p>
            )}
          </div>
          <div className="relative z-10 rounded-xl border border-white/30 bg-white/20 px-4 py-2 text-center backdrop-blur-sm">
            <p className="text-micro uppercase">Vérifié</p>
            <p className="text-label-md">communauté</p>
          </div>
        </section>
      )}

      {/* Cheaper alternative — voice-first comparator surfaced visually too */}
      {cheaperAlt?.best_price != null && data.best_price != null && (
        <Link
          href={`/courses/detail?barcode=${cheaperAlt.barcode}`}
          aria-label={`Alternative moins chère : ${cheaperAlt.name} à ${eur(cheaperAlt.best_price)} — voir la fiche produit`}
          className="mb-6 flex items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4 transition-colors hover:border-primary"
        >
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon name="savings" fill className="text-[22px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-micro uppercase tracking-wider text-primary">Moins cher</p>
            <p className="truncate text-label-lg text-on-surface">{cheaperAlt.name}</p>
          </div>
          <div className="text-right">
            <p className="text-headline-md text-primary">{eur(cheaperAlt.best_price)}</p>
            <p className="text-micro text-on-surface-variant">
              −{eur(data.best_price - cheaperAlt.best_price)}
            </p>
          </div>
        </Link>
      )}

      {/* Buy online — after seeing the price, go to the merchant offers */}
      <a
        href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(
          [data.name, data.brand].filter(Boolean).join(" "),
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary mb-6 w-full py-3.5"
      >
        <Icon name="storefront" className="text-[20px]" /> Acheter en ligne
      </a>

      {/* Price history */}
      {history && history.points.length >= 2 && (
        <section className="card mb-6 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="show_chart" className="text-primary" />
            <h3 className="text-headline-md text-on-surface">Historique des prix</h3>
          </div>
          <PriceChart points={history.points} lowest={history.lowest} highest={history.highest} />
        </section>
      )}

      {/* Store comparison */}
      <section className="mb-6">
        <h3 className="mb-3 text-headline-md text-on-surface">Comparatif magasins</h3>
        <div className="space-y-3">
          {data.prices.length === 0 && (
            <p className="text-body-md text-on-surface-variant">Aucun prix relevé. Ajoutez le vôtre 👇</p>
          )}
          {data.prices.map((p, i) => (
            <a
              key={i}
              href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(
                [data.name, p.store].filter(Boolean).join(" "),
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="card flex items-center justify-between p-4 transition-shadow hover:shadow-float"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container text-headline-md text-primary">
                  {(p.store ?? "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-label-lg text-on-surface">{p.store ?? "Magasin"}</p>
                  <p className="flex items-center gap-1 text-micro uppercase text-on-surface-variant">
                    {p.source} <Icon name="open_in_new" className="text-[13px]" />
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-headline-md text-on-surface">{eur(p.price)}</p>
                {p.unit_price != null && (
                  <p className="text-micro text-on-surface-variant">
                    {eur(p.unit_price)} {p.unit_label}
                  </p>
                )}
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Healthier alternatives */}
      {alternatives && alternatives.items.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="eco" fill className="text-primary" />
            <h3 className="text-headline-md text-on-surface">Alternatives plus saines</h3>
          </div>
          <p className="mb-3 text-body-md text-on-surface-variant">
            Mêmes rayons, meilleur Nutri-Score.
          </p>
          <div className="space-y-3">
            {alternatives.items.map((p) => (
              <ProductCard key={p.barcode} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Community add price */}
      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-headline-md text-on-surface">Prix communautaires</h3>
        </div>
        <form onSubmit={contribute} className="flex flex-col gap-3 sm:flex-row">
          <input
            className="input flex-1"
            placeholder="Magasin"
            aria-label="Nom du magasin"
            value={store}
            onChange={(e) => setStore(e.target.value)}
            required
          />
          <input
            className="input sm:w-32"
            type="number"
            step="0.01"
            placeholder="Prix €"
            aria-label="Prix en euros"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          <button className="btn-primary">
            <Icon name="add" className="text-[18px]" /> Ajouter
          </button>
        </form>
      </section>
    </div>
  );
}
