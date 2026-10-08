"use client";

/**
 * "Les promos du jour près de chez vous": real price drops from our own price
 * history, the products already on your list first. "+" puts one on the list.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { eur } from "@/lib/format";
import { useApp } from "@/lib/store";

const SHOWN = 5;

export function TodayPromos() {
  const { user, openLogin } = useApp();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["products", "bargains"], queryFn: () => api.bargains(20) });
  const { data: list } = useQuery({
    queryKey: ["shopping"],
    queryFn: () => api.getShoppingList(),
    enabled: !!user,
  });
  const onList = new Set((list?.items ?? []).filter((i) => !i.checked && i.barcode).map((i) => i.barcode));
  const add = useMutation({
    mutationFn: (b: { barcode: string; name: string | null }) =>
      api.addToList({ barcode: b.barcode, name: b.name ?? undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping"] }),
  });

  // A "−96 %" is a reference price recorded for another pack size, not a
  // promotion: past 60 % the drop is not believable and stays out.
  const items = [...(data?.items ?? [])]
    .filter((b) => b.drop_pct >= 0.05 && b.drop_pct <= 0.6)
    .sort((a, b) => Number(onList.has(b.barcode)) - Number(onList.has(a.barcode)) || b.drop_pct - a.drop_pct)
    .slice(0, SHOWN);
  if (!items.length) return null;

  return (
    <section aria-labelledby="t-promos" className="card mb-5 p-4">
      <h2 id="t-promos" className="flex items-center gap-2 text-label-lg text-on-surface">
        <Icon name="local_offer" className="text-[20px]" /> Les promos du jour près de chez vous
      </h2>
      <ul className="mt-2">
        {items.map((b) => {
          const mine = onList.has(b.barcode);
          const pct = Math.round(b.drop_pct * 100);
          return (
            <li
              key={`${b.barcode}-${b.store}`}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-dashed border-outline-variant py-2.5 last:border-0"
            >
              <Link href={`/courses/detail?barcode=${b.barcode}`} className="min-w-0">
                <span className="block break-words text-label-lg text-on-surface">
                  {b.name ?? "Produit"}
                  {mine && (
                    <span className="ml-1.5 inline-block rounded-md bg-primary-container px-1.5 py-0.5 align-[2px] text-[10px] font-extrabold uppercase tracking-wider text-on-primary-container">
                      sur ta liste
                    </span>
                  )}
                </span>
                <span className="block text-micro text-on-surface-variant">
                  {b.store ?? "Un magasin"} · −{pct} %
                </span>
              </Link>
              <span className="text-right tabular-nums">
                <span className="block text-label-lg text-on-surface">{eur(b.price)}</span>
                <s className="block text-micro text-on-surface-variant">{eur(b.reference_price)}</s>
              </span>
              <button
                onClick={() => (user ? add.mutate({ barcode: b.barcode, name: b.name }) : openLogin(true))}
                disabled={mine || (add.isPending && add.variables?.barcode === b.barcode)}
                aria-label={mine ? `${b.name ?? "Produit"} est déjà sur votre liste` : `Ajouter ${b.name ?? "ce produit"} à ma liste`}
                className={`grid h-11 w-11 place-items-center rounded-full ${
                  mine ? "bg-primary-container text-on-primary-container" : "bg-surface-container text-on-surface"
                }`}
              >
                <Icon name={mine ? "check" : "add"} className="text-[22px]" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
