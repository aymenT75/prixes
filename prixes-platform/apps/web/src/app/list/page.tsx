"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { SmartAssistant } from "@/components/SmartAssistant";
import { StorePlan } from "@/components/StorePlan";
import { api } from "@/lib/api";
import { eur, nutriBarStyle, nutriHint } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { ShoppingItem, SplitResult } from "@/lib/types";

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

  if (!user) {
    return (
      <div>
        <PageHeader title="Ma liste" />
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Icon name="list_alt" className="text-[48px] text-outline-variant" />
          <p className="text-on-surface-variant">Connectez-vous pour créer votre liste de courses.</p>
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
      <PageHeader title="Ma liste" />

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
  const recipeAmount =
    item.amount != null && item.unit
      ? `${String(item.amount).replace(/\.0+$/, "").replace(".", ",")} ${item.unit}`
      : null;

  return (
    <div
      style={nutriBarStyle(item.nutriscore)}
      className={`card flex items-center gap-3 p-3 ${item.checked ? "opacity-50" : ""}`}
    >
      <button onClick={onToggle} aria-label="Cocher" className="flex-shrink-0">
        <Icon
          name={item.checked ? "check_circle" : "radio_button_unchecked"}
          fill={item.checked}
          className={`text-[26px] ${item.checked ? "text-primary" : "text-outline-variant"}`}
        />
      </button>

      <Thumb item={item} />

      <div className="min-w-0 flex-1">
        <p className={`truncate text-label-lg text-on-surface ${item.checked ? "line-through" : ""}`}>
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
        <p className="truncate text-micro text-on-surface-variant">
          {recipeAmount && <span>{recipeAmount} · </span>}
          {item.best_price != null ? `${eur(item.best_price)} / u.` : "prix inconnu"}
        </p>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <button
          onClick={() => onQty(Math.max(1, item.quantity - 1))}
          aria-label="Moins"
          className="grid h-7 w-7 place-items-center rounded-full bg-surface-container text-on-surface active:scale-90"
        >
          <Icon name="remove" className="text-[16px]" />
        </button>
        <span className="w-6 text-center text-label-lg text-on-surface">{item.quantity}</span>
        <button
          onClick={() => onQty(Math.min(99, item.quantity + 1))}
          aria-label="Plus"
          className="grid h-7 w-7 place-items-center rounded-full bg-surface-container text-on-surface active:scale-90"
        >
          <Icon name="add" className="text-[16px]" />
        </button>
      </div>

      <button onClick={onRemove} aria-label="Supprimer" className="flex-shrink-0 text-outline-variant hover:text-error">
        <Icon name="close" className="text-[20px]" />
      </button>
    </div>
  );
}

function Thumb({ item }: { item: ShoppingItem }) {
  const inner = item.image_url ? (
    <Image src={item.image_url} alt={item.name ?? ""} fill className="object-contain p-1" sizes="48px" />
  ) : (
    <div className="flex h-full items-center justify-center text-outline-variant">
      <Icon name={item.barcode ? "grocery" : "edit_note"} />
    </div>
  );
  const box = "relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-white";
  // No barcode means no product page to open — render a plain box, not a dead link.
  return item.barcode ? (
    <Link href={`/courses/detail?barcode=${item.barcode}`} className={box}>
      {inner}
    </Link>
  ) : (
    <div className={box}>{inner}</div>
  );
}
