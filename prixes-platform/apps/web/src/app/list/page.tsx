"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { Icon } from "@/components/Icon";
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
      <div className="flex flex-col gap-4">
        <PageHeader title="Ma liste" />
        <p className="text-[24px] leading-snug text-on-surface">
          Connectez-vous pour garder votre liste sur votre téléphone.
        </p>
        <button onClick={() => openLogin(true)} className="big-btn big-btn-main">
          <Icon name="login" className="text-[44px]" /> Se connecter
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
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

      <ul className="flex flex-col gap-3">
        {items.map((i) => {
          const danger = allergensIn(i.allergens, profile);
          return (
            <li key={i.id}>
              <button
                role="checkbox"
                aria-checked={i.checked}
                aria-label={spoken(i, profile)}
                onClick={() => toggle.mutate(i)}
                className="flex min-h-[80px] w-full items-center gap-3 rounded-[18px] border-2 border-[rgb(var(--color-btn-line))] bg-surface-container-lowest p-3 text-left text-[27px] leading-tight text-on-surface"
              >
                <Icon name={i.checked ? "check_box" : "check_box_outline_blank"} fill={i.checked} className="text-[44px]" />
                <span className="min-w-0 flex-1 break-words">
                  <span className={i.checked ? "font-normal line-through" : "font-bold"}>
                    {nameOf(i)}
                    {i.quantity > 1 ? ` × ${i.quantity}` : ""}
                  </span>
                  {danger.length > 0 && (
                    <span className="mt-1 flex items-center gap-1 rounded-lg bg-error-container px-2 py-1 text-[20px] font-bold text-on-error-container">
                      <Icon name="warning" fill className="text-[24px]" /> Contient : {danger.join(", ")}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex flex-col gap-3">
        {left.length > 0 && (
          <button onClick={readAll} className="big-btn big-btn-main">
            <Icon name="volume_up" className="text-[44px]" /> Lire ma liste
          </button>
        )}
        <button onClick={() => setVoiceOpen(true)} className={`big-btn ${left.length ? "" : "big-btn-main"}`}>
          <Icon name="mic" className="text-[44px]" /> Ajouter
        </button>
        {anyChecked && (
          <button onClick={() => clear.mutate()} disabled={clear.isPending} className="big-btn">
            <Icon name="delete_sweep" className="text-[44px]" /> Retirer les cochés
          </button>
        )}
      </div>
    </div>
  );
}
