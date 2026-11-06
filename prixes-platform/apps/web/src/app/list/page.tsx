"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { Icon, Tick } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { allergensIn } from "@/lib/allergens";
import { api } from "@/lib/api";
import { announce, talk, useSpeakOnOpen } from "@/lib/say";
import { useApp } from "@/lib/store";
import type { ShoppingItem } from "@/lib/types";
import { useA11y } from "@/lib/useA11y";
import { hapticDanger, hapticSuccess } from "@/lib/voice";

function nameOf(i: ShoppingItem): string {
  return i.name ?? i.free_text ?? "Produit";
}

function products(n: number): string {
  return `${n} produit${n > 1 ? "s" : ""}`;
}

/** The sentence for one line: what it is, how many, and the allergy warning first. */
function spoken(i: ShoppingItem, profile: string[]): string {
  const danger = allergensIn(i.allergens, profile);
  const warn = danger.length ? ` : attention, contient ${danger.join(", ")}` : "";
  return `${nameOf(i)}${i.quantity > 1 ? `, ${i.quantity} fois` : ""}${warn}`;
}

export default function ListPage() {
  const { user, openLogin } = useApp();
  const qc = useQueryClient();
  const profile = useA11y((s) => s.allergens);
  const setVoiceOpen = useA11y((s) => s.setVoiceOpen);

  const { data, isLoading } = useQuery({
    queryKey: ["shopping"],
    queryFn: () => api.getShoppingList(),
    enabled: !!user,
  });
  const items = data?.items ?? [];
  const left = items.filter((i) => !i.checked);
  const anyChecked = left.length < items.length;

  // Once a day, lines matched before matching checked the kind of product and
  // the pack size are matched again (a six-pack for « lait, 1 L », 12/10).
  useEffect(() => {
    if (!user) return;
    const KEY = "prixes.list.rematched";
    const today = new Date().toDateString();
    try {
      if (localStorage.getItem(KEY) === today) return;
      localStorage.setItem(KEY, today);
    } catch {
      /* storage blocked: still worth doing */
    }
    void api
      .rematchList()
      .then((r) => {
        if (r.changed) qc.invalidateQueries({ queryKey: ["shopping"] });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per signed-in visit
  }, [user]);

  const toggle = useMutation({
    mutationFn: (i: ShoppingItem) => api.updateListItem(i.id, { checked: !i.checked }),
    onSuccess: (_, i) => {
      qc.invalidateQueries({ queryKey: ["shopping"] });
      hapticSuccess();
      const now = left.length + (i.checked ? 1 : -1);
      announce(`${nameOf(i)} ${i.checked ? "décoché" : "coché"}. Il reste ${products(now)}.`);
    },
  });
  const clear = useMutation({
    mutationFn: () => api.clearChecked(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopping"] });
      hapticSuccess();
      announce("Produits cochés retirés.");
    },
  });

  function readAll() {
    if (!left.length) {
      talk("Votre liste est vide.");
      return;
    }
    if (left.some((i) => allergensIn(i.allergens, profile).length)) hapticDanger();
    talk(`${products(left.length)}. ${left.map((i) => spoken(i, profile)).join(". ")}.`);
  }

  useSpeakOnOpen(
    !user || isLoading || !data
      ? null
      : left.length
        ? `Ma liste : ${products(left.length)}.`
        : "Votre liste est vide. Touchez Ajouter, ou dites un produit.",
  );

  if (!user) {
    return (
      <div className="screen">
        <div className="screen-top flex-1">
          <PageHeader title="Ma liste" />
          <p className="text-[24px] leading-snug text-on-surface">
            Connectez-vous pour garder votre liste sur votre téléphone.
          </p>
        </div>
        <button onClick={() => openLogin(true)} className="sheet tone-gold">
          <Icon name="login" className="text-[46px]" /> Se connecter
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-top pb-1">
        <PageHeader
          title="Ma liste"
          action={
            <span className="flex-shrink-0 text-[22px] font-bold text-on-surface">{products(left.length)}</span>
          }
        />
        {isLoading && (
          <p role="status" className="text-[24px] text-on-surface">
            Je charge votre liste…
          </p>
        )}
        {!isLoading && !items.length && <p className="text-[24px] leading-snug text-on-surface">Votre liste est vide.</p>}
      </div>

      <ul className="flex-1 pb-[46px]">
        {items.map((i, n) => {
          const danger = allergensIn(i.allergens, profile);
          return (
            <li key={i.id} className="prixes-rise" style={{ animationDelay: `${Math.min(n, 12) * 35}ms` }}>
              <button
                role="checkbox"
                aria-checked={i.checked}
                aria-label={spoken(i, profile)}
                onClick={() => toggle.mutate(i)}
                className={`hair-row ${danger.length ? "row-alert" : ""}`}
              >
                <span className="tick" data-on={i.checked}>
                  <Tick />
                </span>
                <span className="min-w-0 flex-1 break-words">
                  <span className={i.checked ? "font-normal line-through opacity-80" : ""}>
                    {nameOf(i)}
                    {i.quantity > 1 ? ` × ${i.quantity}` : ""}
                  </span>
                  {danger.length > 0 && (
                    <span className="mt-1 flex items-center gap-1.5 text-[21px] font-bold">
                      <Icon name="warning" fill className="text-[24px]" /> Contient : {danger.join(", ")}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {anyChecked && (
          <li>
            <button
              onClick={() => clear.mutate()}
              disabled={clear.isPending}
              className="hair-row min-h-16 justify-center gap-2.5 border-0 text-[23px]"
            >
              <Icon name="delete_sweep" className="text-[30px]" /> Retirer les cochés
            </button>
          </li>
        )}
      </ul>

      {left.length > 0 ? (
        <div className="split">
          <button onClick={readAll} aria-label="Lire ma liste" className="tone-gold">
            <Icon name="volume_up" className="text-[42px]" /> Lire
          </button>
          <button onClick={() => setVoiceOpen(true)} className="tone-n2">
            <Icon name="mic" className="text-[42px]" /> Ajouter
          </button>
        </div>
      ) : (
        <button onClick={() => setVoiceOpen(true)} className="sheet tone-gold">
          <Icon name="mic" fill className="text-[46px]" /> Ajouter
        </button>
      )}
    </div>
  );
}
