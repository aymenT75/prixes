"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ProductThumb } from "@/components/ProductThumb";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { SmartAssistant } from "@/components/SmartAssistant";
import { StorePlan } from "@/components/StorePlan";
import { api } from "@/lib/api";
import { eur, nutriBarStyle, nutriHint } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useA11y } from "@/lib/useA11y";
import type { ShoppingItem, SplitResult } from "@/lib/types";
import { spokenPrice, useVoiceTask } from "@/lib/voiceTasks";

export default function ListPage() {
  const { user, openLogin } = useApp();
  const qc = useQueryClient();
  const [plan, setPlan] = useState<SplitResult | null>(null);

  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () => api.meta(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["shopping"],
    queryFn: () => api.getShoppingList(),
    enabled: !!user,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["shopping"] });
    setPlan(null);
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
    onSuccess: setPlan,
  });

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
        <PageHeader title="Assistant" />
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

  return (
    <div>
      <PageHeader title="Assistant" />

      <SmartAssistant />

      {/* Not a bottom-nav tab: the nav has four established destinations, and
          the list is where planning a week starts. Hidden when the planner has no
          model or no document store behind it — a link to a page that can only
          say "indisponible" is worse than no link. */}
      {meta?.meal_plan_enabled && (
        <Link
          href="/menu"
          className="card mb-4 flex items-center gap-2 p-3 text-label-md text-on-surface"
        >
          <Icon name="calendar_month" className="text-[20px] text-primary" />
          Menu de la semaine
          <Icon name="chevron_right" className="ml-auto text-[20px] text-outline-variant" />
        </Link>
      )}

      {isLoading && <p className="py-10 text-center text-on-surface-variant">Chargement…</p>}

      {!isLoading && items.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-on-surface-variant">
          <Icon name="shopping_cart" className="text-[36px] text-outline-variant" />
          <p className="text-body-md">Votre liste est vide.</p>
          <Link href="/courses" className="btn-primary mt-2">
            <Icon name="add" className="text-[18px]" /> Ajouter des produits
          </Link>
        </div>
      )}

      {items.length > 0 && (
        <>
          <h2 className="mb-2 text-headline-md text-on-surface">Ma liste</h2>
          <div className="space-y-2">
            {items.map((it) => (
              <ListRow
                key={it.id}
                item={it}
                onToggle={() => update.mutate({ id: it.id, body: { checked: !it.checked } })}
                onQty={(q) => update.mutate({ id: it.id, body: { quantity: q } })}
                onRemove={() => remove.mutate(it.id)}
              />
            ))}
          </div>

          <div className="card mt-4 flex items-center justify-between p-4">
            <div>
              <p className="text-micro uppercase tracking-wider text-on-surface-variant">
                Estimation (meilleur prix)
              </p>
              <p className="text-headline-md text-on-surface">{eur(estimate)}</p>
            </div>
            {anyChecked && (
              <button
                onClick={() => clearChecked.mutate()}
                className="btn-outline text-label-md"
              >
                <Icon name="delete_sweep" className="text-[18px]" /> Vider les cochés
              </button>
            )}
          </div>

          <button
            onClick={() => organise.mutate()}
            disabled={organise.isPending}
            className="btn-primary mt-4 w-full py-3"
          >
            <Icon name="savings" className="text-[20px]" />
            {organise.isPending ? "Calcul…" : "Où faire mes courses ?"}
          </button>

          {plan && <StorePlan result={plan} />}
        </>
      )}
    </div>
  );
}

function ListRow({
  item,
  onToggle,
  onQty,
  onRemove,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onQty: (q: number) => void;
  onRemove: () => void;
}) {
  const label = item.name ?? item.free_text ?? item.barcode ?? "Article";
  // At the largest text size a name squeezed between the tick, the picture and
  // the cross got one word per line ("Échalot-es"); there it takes the card's
  // whole width, under the tick, picture and cross.
  const big = useA11y((s) => s.fontScale === "xl");
  const recipeAmount =
    item.amount != null && item.unit
      ? `${String(item.amount).replace(/\.0+$/, "").replace(".", ",")} ${item.unit}`
      : null;

  return (
    // A ticked line used to fade as a whole (opacity 50 %), which took its text
    // below the contrast a low-vision reader needs. Only the picture fades now;
    // the strike-through and the ticked box say "done".
    <div
      style={nutriBarStyle(item.nutriscore)}
      className={`card flex items-center gap-3 p-3 ${big ? "flex-wrap" : ""}`}
    >
      {/* A checkbox that names its item: "Cocher" alone, forty times over, told a
          screen-reader user nothing about which line or whether it was done. */}
      <button
        onClick={onToggle}
        role="checkbox"
        aria-checked={item.checked}
        aria-label={label}
        className="grid min-h-11 min-w-11 flex-shrink-0 place-items-center"
      >
        <Icon
          name={item.checked ? "check_circle" : "radio_button_unchecked"}
          fill={item.checked}
          className={`text-[26px] ${item.checked ? "text-primary" : "text-outline-variant"}`}
        />
      </button>

      <Thumb item={item} />

      {/* The name wraps instead of being cut: at the largest text size "Crème
          fraîche épaisse" became "Crè…". The quantity buttons sit under it, which
          gives the name the row's width and the buttons room for a full 44 px. */}
      <div className={`min-w-0 flex-1 ${big ? "order-last basis-full" : ""}`}>
        <p
          className={`break-words text-label-lg ${
            item.checked ? "text-on-surface-variant line-through" : "text-on-surface"
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
        <p className="break-words text-micro text-on-surface-variant">
          {recipeAmount && <span>{recipeAmount} · </span>}
          {item.best_price != null
            ? `${eur(item.best_price)} / ${item.pack || "u."}`
            : "prix inconnu"}
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
