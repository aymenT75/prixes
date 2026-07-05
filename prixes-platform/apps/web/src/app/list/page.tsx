"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { eur } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { OptimizeResult, ShoppingItem } from "@/lib/types";

export default function ListPage() {
  const { user, openLogin } = useApp();
  const qc = useQueryClient();
  const [optimized, setOptimized] = useState<OptimizeResult | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["shopping"],
    queryFn: () => api.getShoppingList(),
    enabled: !!user,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["shopping"] });
    setOptimized(null);
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
  const optimize = useMutation({
    mutationFn: () => api.optimizeBasket(),
    onSuccess: (r) => setOptimized(r),
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
            onClick={() => optimize.mutate()}
            disabled={optimize.isPending}
            className="btn-primary mt-4 w-full py-3"
          >
            <Icon name="savings" className="text-[20px]" />
            {optimize.isPending ? "Calcul…" : "Optimiser mon panier"}
          </button>

          {optimized && <OptimizeView result={optimized} />}
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
  return (
    <div className={`card flex items-center gap-3 p-3 ${item.checked ? "opacity-50" : ""}`}>
      <button onClick={onToggle} aria-label="Cocher" className="flex-shrink-0">
        <Icon
          name={item.checked ? "check_circle" : "radio_button_unchecked"}
          fill={item.checked}
          className={`text-[26px] ${item.checked ? "text-primary" : "text-outline-variant"}`}
        />
      </button>

      <Link href={`/courses/detail?barcode=${item.barcode}`} className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-white">
        {item.image_url ? (
          <Image src={item.image_url} alt={item.name ?? ""} fill className="object-contain p-1" sizes="48px" />
        ) : (
          <div className="flex h-full items-center justify-center text-outline-variant">
            <Icon name="grocery" />
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-label-lg text-on-surface ${item.checked ? "line-through" : ""}`}>
          <Link
            href={`/courses/detail?barcode=${item.barcode}`}
            aria-label={`${item.name ?? item.barcode} — voir la fiche produit`}
            className="hover:underline focus-visible:underline"
          >
            {item.name ?? item.barcode}
          </Link>
        </p>
        {item.best_price != null && (
          <p className="text-micro text-on-surface-variant">{eur(item.best_price)} / u.</p>
        )}
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

function OptimizeView({ result }: { result: OptimizeResult }) {
  if (result.priced_items === 0) {
    return (
      <div className="card mt-4 p-4 text-center text-on-surface-variant">
        <Icon name="info" className="text-[24px]" />
        <p className="mt-1 text-body-md">
          Aucun prix connu pour vos produits. Ajoutez des prix depuis les fiches produit.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {result.best_single_store && (
        <div className="rounded-xl bg-primary-container p-5 text-on-primary-container shadow-float">
          <p className="text-micro uppercase tracking-widest opacity-90">Meilleur magasin unique</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-headline-lg">{result.best_single_store.store}</span>
            <span className="text-headline-lg">{eur(result.best_single_store.total)}</span>
          </div>
          <p className="mt-1 text-label-md opacity-90">
            {result.best_single_store.items_covered}/{result.best_single_store.items_total} produits
            disponibles
          </p>
        </div>
      )}

      {result.cheapest_split_total != null && (
        <div className="card flex items-center justify-between p-4">
          <div>
            <p className="text-label-lg text-on-surface">En optimisant sur plusieurs magasins</p>
            <p className="text-micro text-on-surface-variant">Meilleur prix par produit</p>
          </div>
          <span className="text-headline-md text-primary">{eur(result.cheapest_split_total)}</span>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-headline-md text-on-surface">Comparatif magasins</h3>
        <div className="space-y-2">
          {result.by_store.map((b) => (
            <div key={b.store} className="card p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-label-lg text-on-surface">{b.store}</span>
                  <span className="chip bg-surface-container-high text-micro text-on-surface-variant">
                    {b.items_covered}/{b.items_total}
                  </span>
                </div>
                <span className="text-headline-md text-on-surface">{eur(b.total)}</span>
              </div>
              {b.missing.length > 0 && (
                <p className="mt-1 text-micro text-on-surface-variant">
                  Manque&nbsp;: {b.missing.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {result.unpriced_items > 0 && (
        <p className="text-center text-micro text-on-surface-variant">
          {result.unpriced_items} produit(s) sans prix connu, non inclus.
        </p>
      )}
    </div>
  );
}
