"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ProductThumb } from "@/components/ProductThumb";
import { Icon } from "@/components/Icon";
import { NearbyStoreChoice, type NearbyPick } from "@/components/NearbyStoreChoice";
import { PageHeader } from "@/components/PageHeader";
import { JoinInvite, SHARE_KEY, ShareListSheet } from "@/components/ShareListSheet";
import { SmartAssistant } from "@/components/SmartAssistant";
import { StorePlan } from "@/components/StorePlan";
import { api } from "@/lib/api";
import { distance, eur, nutriBarStyle, nutriHint, perKiloLabel } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useA11y } from "@/lib/useA11y";
import type { ShoppingItem, SplitResult } from "@/lib/types";
import { spokenPrice, useVoiceTask } from "@/lib/voiceTasks";

export default function ListPage() {
  const { user, openLogin } = useApp();
  const qc = useQueryClient();
  const [plan, setPlan] = useState<SplitResult | null>(null);
  const [chosen, setChosen] = useState(0);
  // Mes courses is one journey in three steps, each on its own screen so an
  // older reader sees one thing to do at a time: prepare the list, compare the
  // shops, then go there.
  const [step, setStep] = useState<Step>(1);
  // The shop chosen among those nearby (step 2), and whether there are any.
  // Location is required; with it but no shop within 10 km, step 2 falls back
  // to the comparison by chain.
  const [picked, setPicked] = useState<NearbyPick | null>(null);
  const [noNearby, setNoNearby] = useState(false);
  // A newcomer did not understand what this tab was for: the first visit opens
  // on three lines that say it, once. Read after mount (static export: reading
  // storage during render breaks hydration).
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    try {
      setWelcome(localStorage.getItem(WELCOME_KEY) !== "1");
    } catch {
      /* storage blocked: no welcome card */
    }
  }, []);
  const closeWelcome = () => {
    setWelcome(false);
    try {
      localStorage.setItem(WELCOME_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () => api.meta(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Family sharing: who is on the list. A shared list refreshes itself so what
  // the others add shows up without pulling.
  const { data: share } = useQuery({
    queryKey: SHARE_KEY,
    queryFn: () => api.getShare(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const shared = (share?.members.length ?? 0) > 1;
  const [shareOpen, setShareOpen] = useState(false);
  // An invitation link (/list?rejoindre=ABC123) opens the "join" card. Read
  // after mount: the static export has no search params at render time.
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("rejoindre");
    if (code) setInviteCode(code);
  }, []);
  const closeInvite = () => {
    setInviteCode(null);
    window.history.replaceState(null, "", window.location.pathname);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["shopping"],
    queryFn: () => api.getShoppingList(),
    enabled: !!user,
    refetchInterval: shared ? 15_000 : false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["shopping"] });
    setPlan(null);
    setChosen(0);
    setPicked(null);
    setNoNearby(false);
  };

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { quantity?: number; checked?: boolean } }) =>
      api.updateListItem(id, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.removeListItem(id),
    onSuccess: invalidate,
  });
  const clearChecked = useMutation({
    mutationFn: () => api.clearChecked(),
    onSuccess: invalidate,
  });
  const organise = useMutation({
    mutationFn: () => api.splitBasket(2),
    onSuccess: (result) => {
      setPlan(result);
      setChosen(0);
      setPicked(null);
      setNoNearby(false);
    },
  });

  /** Steps 2 and 3 need a comparison: run it on the way in when there is none. */
  function goTo(next: Step) {
    setStep(next);
    if (next > 1 && !plan && !organise.isPending) organise.mutate();
    window.scrollTo({ top: 0 });
  }

  // Asked by voice ("où faire mes courses ?"): run the comparison and say it.
  // Through mutateAsync's promise: it settles even when the page re-mounts while
  // the request is in flight, which dropped both per-call callbacks and a
  // state watcher, and left the assistant silent (seen in testing, 29/09).
  useEffect(() => {
    if (!useVoiceTask.getState().take("split")) return;
    const { finish } = useVoiceTask.getState();
    if (!user) {
      finish("Connectez-vous pour que je compare les magasins de votre liste.", "roule", false);
      openLogin(true);
      return;
    }
    organise
      .mutateAsync()
      .then((result) => {
        setStep(2);
        const best = result.options[0];
        if (!best) {
          finish("Je ne connais aucun prix pour votre liste. Ajoutez des produits, puis redemandez.", "plein", false);
          return;
        }
        const where = best.stores.join(" puis ");
        const saving =
          best.saving_vs_priciest != null && best.priciest_store
            ? ` ${spokenPrice(best.saving_vs_priciest)} de moins que chez ${best.priciest_store}.`
            : "";
        const missing = best.missing.length
          ? ` ${best.missing.length} article${best.missing.length > 1 ? "s" : ""} à trouver ailleurs.`
          : "";
        finish(`Le moins cher : ${where}, ${spokenPrice(best.total)}.${saving}${missing}`, "plein");
      })
      .catch(() => finish("Je n'ai pas pu comparer les magasins. Réessayez.", "plein", false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  // Signed out, the assistant still runs — trying it is how people understand
  // what the app does. Only keeping the result needs an account, so the sign-in
  // prompt sits under it rather than in front of it.
  if (!user) {
    return (
      <div>
        <PageHeader title="Mes courses" />
        {inviteCode && (
          <p className="mb-4 rounded-xl bg-primary-container p-3 text-body-md text-on-primary-container" role="status">
            Connectez-vous pour rejoindre la liste à laquelle on vous a invité.
          </p>
        )}
        <SmartAssistant />
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <Icon name="list_alt" className="text-[40px] text-outline-variant" />
          <p className="text-body-md text-on-surface-variant">
            Créez un compte pour garder votre liste et retrouver vos courses d&apos;un
            appareil à l&apos;autre.
          </p>
          <button onClick={() => openLogin(true)} className="btn-primary">
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];
  const estimate = items
    .filter((i) => !i.checked && i.best_price != null)
    .reduce((sum, i) => sum + (i.best_price ?? 0) * i.quantity, 0);
  const anyChecked = items.some((i) => i.checked);

  const option = plan?.options[Math.min(chosen, Math.max(plan.options.length - 1, 0))] ?? null;

  return (
    <div>
      <PageHeader title="Mes courses" />

      {welcome && <Welcome onClose={closeWelcome} />}
      {shareOpen && <ShareListSheet onClose={() => setShareOpen(false)} />}
      {inviteCode && <JoinInvite code={inviteCode} onDone={closeInvite} />}

      <Stepper step={step} onStep={goTo} canCompare={items.length > 0} />

      {step === 1 && (
        <>
          {!isLoading && items.length === 0 && (
            <p className="-mt-3 mb-4 text-center text-body-md text-on-surface-variant">
              Ajoutez d&apos;abord des produits pour comparer les magasins.
            </p>
          )}

          {/* An empty list starts from the microphone; a list in progress shows
              itself first, the thing people come back for. */}
          {!isLoading && items.length === 0 && <SmartAssistant start />}
          {!isLoading && items.length === 0 && !shared && (
            <button
              onClick={() => setShareOpen(true)}
              className="-mt-2 mb-4 flex min-h-11 w-full items-center justify-center gap-1 text-label-md text-primary"
            >
              <Icon name="share" className="text-[18px]" /> Partager ou rejoindre une liste
            </button>
          )}

          {isLoading && (
            <div className="space-y-2" role="status" aria-label="Chargement de la liste">
              {[0, 1, 2].map((k) => (
                <div key={k} className="card flex items-center gap-3 p-4">
                  <span className="prixes-skeleton h-7 w-7 flex-shrink-0" />
                  <span className="flex-1 space-y-2">
                    <span className="prixes-skeleton block h-3.5" style={{ width: `${70 - k * 12}%` }} />
                    <span className="prixes-skeleton block h-3 w-1/3" />
                  </span>
                </div>
              ))}
            </div>
          )}

          {shared && share && (
            <button
              onClick={() => setShareOpen(true)}
              className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-xl bg-primary-container px-3 py-2 text-left text-body-md text-on-primary-container"
            >
              <span className="flex flex-shrink-0">
                {share.members.map((m, i) => (
                  <span
                    key={m.id}
                    aria-hidden
                    className={`grid h-8 w-8 place-items-center rounded-full border-2 border-primary-container bg-on-primary-container text-micro text-primary-container ${i ? "-ml-2" : ""}`}
                  >
                    {m.initials}
                  </span>
                ))}
              </span>
              <span className="min-w-0 flex-1 break-words">
                {share.is_owner
                  ? `Liste partagée avec ${share.members.filter((m) => !m.you).map((m) => m.name).join(" et ")}`
                  : `Liste de ${share.owner_name}`}
              </span>
              <Icon name="chevron_right" className="text-[20px]" />
            </button>
          )}

          {items.length > 0 && (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-headline-md text-on-surface">Ma liste</h2>
                {!shared && (
                  <button
                    onClick={() => setShareOpen(true)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-full border border-primary px-4 text-label-md text-primary"
                  >
                    <Icon name="share" className="text-[18px]" /> Partager
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {items.map((it, index) => (
                  <ListRow
                    key={it.id}
                    index={index}
                    item={it}
                    onToggle={() => update.mutate({ id: it.id, body: { checked: !it.checked } })}
                    onQty={(q) => update.mutate({ id: it.id, body: { quantity: q } })}
                    onRemove={() => remove.mutate(it.id)}
                  />
                ))}
              </div>

              <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-micro uppercase tracking-wider text-on-surface-variant">
                    Environ
                  </p>
                  <p className="text-headline-md text-on-surface">{eur(estimate)}</p>
                </div>
                {anyChecked && (
                  <button onClick={() => clearChecked.mutate()} className="btn-outline text-label-md">
                    <Icon name="delete_sweep" className="text-[18px]" /> Vider les cochés
                  </button>
                )}
              </div>

              <NextStep onClick={() => goTo(2)} label="Étape 2 : trouver le magasin le moins cher" />

              <h2 className="mb-2 mt-8 text-headline-md text-on-surface">Ajouter à la liste</h2>
              <SmartAssistant />
            </>
          )}

          {/* Not a bottom-nav tab: the nav has four established destinations, and
              the list is where planning a week starts. Hidden when the planner has no
              model or no document store behind it — a link to a page that can only
              say "indisponible" is worse than no link. */}
          {meta?.meal_plan_enabled && (
            <Link
              href="/menu"
              className="card mt-4 flex items-center gap-2 p-3 text-label-md text-on-surface"
            >
              <Icon name="calendar_month" className="text-[20px] text-primary" />
              Menu de la semaine
              <Icon name="chevron_right" className="ml-auto text-[20px] text-outline-variant" />
            </Link>
          )}
        </>
      )}

      {step === 2 && (
        <section aria-labelledby="t-compare">
          <h2 id="t-compare" className="text-headline-md text-on-surface">
            Où acheter votre liste au meilleur prix
          </h2>
          {organise.isPending && <Working />}
          {organise.isError && (
            <p className="py-6 text-body-md text-error" role="alert">
              Je n&apos;ai pas pu comparer les magasins.{" "}
              <button onClick={() => organise.mutate()} className="underline underline-offset-2">
                Réessayer
              </button>
            </p>
          )}
          {plan && !organise.isPending && (
            <>
              {/* The shops around you first, closest and cheapest marked: the
                  choice of where to go is the user's. */}
              {(plan.by_store?.length ?? 0) > 0 && !noNearby ? (
                <NearbyStoreChoice
                  plan={plan}
                  onPick={(p) => {
                    setPicked(p);
                    goTo(3);
                  }}
                  onUnavailable={() => setNoNearby(true)}
                  more={
                    <details className="mt-5">
                      <summary className="flex min-h-11 cursor-pointer items-center gap-1 text-label-lg text-primary">
                        <Icon name="savings" className="text-[20px]" /> Répartir entre deux enseignes
                      </summary>
                      <StorePlan result={plan} chosen={chosen} onChoose={setChosen} />
                      {option && (
                        <NextStep
                          onClick={() => {
                            setPicked(null);
                            goTo(3);
                          }}
                          label="J'y vais avec ce plan"
                        />
                      )}
                    </details>
                  }
                />
              ) : (
                <>
                  {noNearby && (
                    <p className="mt-3 rounded-xl bg-surface-container p-3 text-body-md text-on-surface-variant" role="status">
                      Aucun magasin qui vend votre liste à moins de 10 km. Voici la comparaison par enseigne.
                    </p>
                  )}
                  <StorePlan result={plan} chosen={chosen} onChoose={setChosen} />
                  {option && <NextStep onClick={() => goTo(3)} label="J'y vais" />}
                </>
              )}
            </>
          )}
          <BackStep onClick={() => goTo(1)} label="Modifier ma liste" />
        </section>
      )}

      {step === 3 && (
        <section aria-labelledby="t-go">
          <h2 id="t-go" className="text-headline-md text-on-surface">
            {!picked && option && option.stores.length > 1 ? "Votre tournée" : "Votre magasin"}
          </h2>
          {organise.isPending && <Working />}
          {picked && !organise.isPending && (
            <div className="card mt-3 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-headline-md text-on-surface">{picked.basket.store}</span>
                <span className="text-headline-md text-primary">{eur(picked.basket.subtotal)}</span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-body-md text-on-surface-variant">
                <Icon name="near_me" className="text-[18px] text-primary" />
                {distance(picked.branch.distance_km)}
                {picked.branch.address ? ` · ${picked.branch.address}` : ""}
              </p>
              <p className="text-body-md text-on-surface-variant">
                {picked.basket.items.length} article{picked.basket.items.length > 1 ? "s" : ""} à prendre
                ici
              </p>
              <Link
                href={`/stores/map?store=${encodeURIComponent(picked.basket.store)}`}
                className="btn-primary mt-3 w-full py-3"
              >
                <Icon name="directions" className="text-[20px]" /> Itinéraire vers {picked.basket.store}
              </Link>
            </div>
          )}
          {!picked && option && !organise.isPending && (
            <ol className="mt-3 space-y-3">
              {option.baskets.map((basket, i) => (
                <li key={basket.store} className="card p-4">
                  <p className="text-micro uppercase tracking-wider text-on-surface-variant">
                    {option.baskets.length > 1
                      ? `Arrêt ${i + 1} sur ${option.baskets.length}`
                      : option.missing.length === 0
                        ? "Tout ici"
                        : "Le gros des courses ici"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-headline-md text-on-surface">{basket.store}</span>
                    <span className="text-headline-md text-primary">{eur(basket.subtotal)}</span>
                  </div>
                  <p className="text-body-md text-on-surface-variant">
                    {basket.items.length} article{basket.items.length > 1 ? "s" : ""} à prendre ici
                  </p>
                  <Link
                    href={`/stores/map?store=${encodeURIComponent(basket.store)}`}
                    className="btn-primary mt-3 w-full py-3"
                  >
                    <Icon name="directions" className="text-[20px]" /> Itinéraire vers {basket.store}
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {!picked && option && option.missing.length > 0 && (
            <p className="mt-3 text-body-md text-on-surface-variant">
              {option.missing.length} article{option.missing.length > 1 ? "s" : ""} à trouver
              ailleurs : la liste est à l&apos;étape « Comparer ».
            </p>
          )}
          {plan && plan.options.length === 0 && (
            <p className="py-6 text-body-md text-on-surface-variant">
              Aucun prix connu pour votre liste : impossible de choisir un magasin.
            </p>
          )}
          <button onClick={() => goTo(1)} className="btn-outline mt-4 w-full py-3">
            <Icon name="check_circle" className="text-[20px]" /> Au magasin : cocher ma liste
          </button>
          <BackStep onClick={() => goTo(2)} label="Revoir la comparaison" />
        </section>
      )}
    </div>
  );
}

type Step = 1 | 2 | 3;

const STEPS: { n: Step; label: string; hint: string; icon: string }[] = [
  { n: 1, label: "Préparer", hint: "ma liste", icon: "list_alt" },
  { n: 2, label: "Comparer", hint: "les magasins", icon: "savings" },
  { n: 3, label: "Y aller", hint: "avec l'itinéraire", icon: "directions" },
];

const WELCOME_KEY = "prixes.courses.welcome";

/** Shown on the first visit only: what this tab does, in three lines. */
function Welcome({ onClose }: { onClose: () => void }) {
  return (
    <section
      aria-labelledby="t-welcome"
      className="prixes-rise mb-5 rounded-2xl border border-primary-container bg-primary-container/25 p-4"
    >
      <h2 id="t-welcome" className="text-headline-md text-on-surface">
        Vos courses en 3 étapes
      </h2>
      <ol className="mt-3 space-y-2.5">
        {[
          ["Faites votre liste", "à la voix ou en cherchant un produit."],
          ["Prixes trouve le magasin", "le moins cher près de chez vous."],
          ["Prixes vous y guide", "puis vous cochez la liste en magasin."],
        ].map(([strong, rest], i) => (
          <li key={strong} className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-label-md text-on-primary">
              {i + 1}
            </span>
            <span className="text-body-md text-on-surface">
              <strong>{strong}</strong> {rest}
            </span>
          </li>
        ))}
      </ol>
      <button onClick={onClose} className="btn-primary mt-4 w-full py-3">
        C&apos;est parti
      </button>
    </section>
  );
}

/** The three steps, always visible: where you are and what comes next. */
function Stepper({
  step,
  onStep,
  canCompare,
}: {
  step: Step;
  onStep: (s: Step) => void;
  canCompare: boolean;
}) {
  return (
    <nav aria-label="Étapes des courses" className="mb-5">
      {/* One yellow pill slides under the current step (a spring, not a jump),
          so moving from step to step is felt as progress. */}
      <ol className="relative grid grid-cols-3 gap-1 rounded-2xl border border-outline-variant bg-surface-container-lowest p-1">
        <li
          aria-hidden
          className="prixes-pill pointer-events-none absolute bottom-1 left-1 top-1 rounded-xl bg-primary-container shadow-glow"
          style={{
            width: "calc((100% - 0.5rem - 0.5rem) / 3)",
            transform: `translateX(calc(${step - 1} * (100% + 0.25rem)))`,
          }}
        />
        {STEPS.map((s) => {
          const current = s.n === step;
          const done = s.n < step;
          return (
            <li key={s.n} className="relative min-w-0">
              <button
                onClick={() => onStep(s.n)}
                disabled={s.n > 1 && !canCompare}
                aria-current={current ? "step" : undefined}
                className={`flex min-h-[64px] w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center transition-colors duration-300 disabled:opacity-40 ${
                  current ? "text-on-primary-container" : done ? "text-on-surface" : "text-on-surface-variant"
                }`}
              >
                <span className="flex items-center gap-1 text-label-md">
                  <Icon name={done ? "check_circle" : s.icon} fill={done} className="text-[20px]" />
                  <span className="sr-only">Étape</span> {s.n}
                </span>
                <span className="max-w-full break-words text-label-lg">{s.label}</span>
                <span className="max-w-full break-words text-[12px] leading-tight opacity-90">{s.hint}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Working() {
  return (
    <p className="flex items-center gap-2 py-10 text-on-surface-variant" role="status">
      <Icon name="progress_activity" className="animate-spin text-primary" /> Je compare les magasins…
    </p>
  );
}

function NextStep({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="btn-primary mt-4 w-full py-3 text-label-lg">
      {label}
      <Icon name="arrow_forward" className="text-[20px]" />
    </button>
  );
}

function BackStep({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 flex min-h-11 w-full items-center justify-center gap-1 text-label-md text-primary"
    >
      <Icon name="arrow_back" className="text-[18px]" /> {label}
    </button>
  );
}

function ListRow({
  item,
  index = 0,
  onToggle,
  onQty,
  onRemove,
}: {
  item: ShoppingItem;
  /** Position in the list: rows arrive one after the other, 60 ms apart. */
  index?: number;
  onToggle: () => void;
  onQty: (q: number) => void;
  onRemove: () => void;
}) {
  const label = item.name ?? item.free_text ?? item.barcode ?? "Article";
  // At the largest text size a name squeezed between the tick, the picture and
  // the cross got one word per line ("Échalot-es"); there it takes the card's
  // whole width, under the tick, picture and cross.
  const big = useA11y((s) => s.fontScale === "xl");
  const [on, setOn] = useState(item.checked);
  useEffect(() => setOn(item.checked), [item.checked]);
  // Loose fruit and vegetables read like the shop's label, per kilo; the
  // recipe amount ("0,500 pièce") meant nothing to anyone and is dropped there.
  const fresh = item.barcode?.startsWith("fl:") ?? false;
  const perKilo = fresh && item.best_price != null ? perKiloLabel(item.best_price, item.pack) : null;
  const recipeAmount =
    !fresh && item.amount != null && item.unit
      ? `${String(Number(item.amount)).replace(".", ",")} ${item.unit}`
      : null;

  return (
    // A ticked line used to fade as a whole (opacity 50 %), which took its text
    // below the contrast a low-vision reader needs. Only the picture fades now;
    // the strike-through and the ticked box say "done".
    <div
      className={`prixes-rise card flex items-center gap-3 p-3 ${big ? "flex-wrap" : ""}`}
      style={{ ...nutriBarStyle(item.nutriscore), animationDelay: `${Math.min(index, 12) * 60}ms` }}
    >
      {/* A checkbox that names its item: "Cocher" alone, forty times over, told a
          screen-reader user nothing about which line or whether it was done. */}
      <button
        onClick={() => {
          setOn(!on);
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
          onToggle();
        }}
        role="checkbox"
        aria-checked={on}
        aria-label={label}
        className="grid min-h-11 min-w-11 flex-shrink-0 place-items-center"
      >
        {/* The circle fills, the tick draws itself, the name gets struck: done,
            at a glance, in the shop. */}
        <span
          data-on={on}
          className={`prixes-tick grid h-7 w-7 place-items-center rounded-full border-2 ${
            on ? "border-primary-container bg-primary-container text-on-primary-container" : "border-outline"
          }`}
        >
          <svg viewBox="0 0 14 14" className="h-4 w-4" aria-hidden>
            <path d="M2.5 7.5l3 3 6-6.5" />
          </svg>
        </span>
      </button>

      <Thumb item={item} />

      {/* The name wraps instead of being cut: at the largest text size "Crème
          fraîche épaisse" became "Crè…". The quantity buttons sit under it, which
          gives the name the row's width and the buttons room for a full 44 px. */}
      <div className={`min-w-0 flex-1 ${big ? "order-last basis-full" : ""}`}>
        <p
          className={`break-words text-label-lg line-through transition-[color,text-decoration-color] duration-300 ${
            on ? "text-on-surface-variant decoration-current" : "text-on-surface decoration-transparent"
          }`}
        >
          {item.barcode ? (
            <Link
              href={`/courses/detail?barcode=${item.barcode}`}
              aria-label={`${label}${
                item.nutriscore && nutriHint[item.nutriscore.toLowerCase()]
                  ? ` — Nutri-Score ${item.nutriscore.toUpperCase()}, ${nutriHint[item.nutriscore.toLowerCase()]}`
                  : ""
              } — voir la fiche produit`}
              className="hover:underline focus-visible:underline"
            >
              {label}
            </Link>
          ) : (
            label
          )}
        </p>
        {/* One line, two facts. A third ("· assistant") pushed this to four wrapped
            lines on a 375 px screen; the notepad thumbnail already marks a line the
            catalog has no product for. */}
        {(item.checked ? item.checked_by_name : item.added_by_name) && (
          <p className="text-micro text-primary">
            {item.checked ? `acheté par ${item.checked_by_name}` : `ajouté par ${item.added_by_name}`}
          </p>
        )}
        <p className="break-words text-micro text-on-surface-variant">
          {recipeAmount && <span>{recipeAmount} · </span>}
          {perKilo ??
            (item.best_price != null
              ? `${eur(item.best_price)}${item.pack ? ` · ${item.pack}` : ""}`
              : "prix inconnu")}
        </p>

        {/* 44 px touch areas (Apple's minimum) around the same 36 px discs: a
            shaky hand kept hitting the name link above instead. */}
        <div className="-ml-1.5 mt-0.5 flex items-center">
          <button
            onClick={() => onQty(Math.max(1, item.quantity - 1))}
            // A list read line by line gives "Moins" a dozen times otherwise, with
            // nothing to say which product it belongs to.
            aria-label={`Retirer un ${label}`}
            className="grid h-11 w-11 place-items-center active:scale-90"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-container text-on-surface">
              <Icon name="remove" className="text-[16px]" />
            </span>
          </button>
          {/* aria-label on a bare <span> is ignored by most screen readers, so the
              word is real (visually hidden) text instead. */}
          <span className="min-w-6 text-center text-label-lg text-on-surface">
            <span className="sr-only">Quantité : </span>
            {item.quantity}
          </span>
          <button
            onClick={() => onQty(Math.min(99, item.quantity + 1))}
            aria-label={`Ajouter un ${label}`}
            className="grid h-11 w-11 place-items-center active:scale-90"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-container text-on-surface">
              <Icon name="add" className="text-[16px]" />
            </span>
          </button>
        </div>
      </div>

      <button
        onClick={onRemove}
        aria-label={`Supprimer ${label} de la liste`}
        className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-outline-variant hover:text-error ${
          big ? "ml-auto" : "self-start"
        }`}
      >
        <Icon name="close" className="text-[20px]" />
      </button>
    </div>
  );
}

function Thumb({ item }: { item: ShoppingItem }) {
  const inner = (
    <ProductThumb
      barcode={item.barcode}
      imageUrl={item.image_url}
      name={item.name}
      size={48}
      className="p-1"
    />
  );
  const box = `relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-white ${
    item.checked ? "opacity-50" : ""
  }`;
  // No barcode means no product page to open — render a plain box, not a dead link.
  // The picture opens the same page as the name, so it is a second way in for the
  // finger only: hidden from screen readers and the Tab key, which otherwise met
  // an unnamed "lien" before every product.
  return item.barcode ? (
    <Link
      href={`/courses/detail?barcode=${item.barcode}`}
      aria-hidden
      tabIndex={-1}
      className={box}
    >
      {inner}
    </Link>
  ) : (
    <div className={box}>{inner}</div>
  );
}
