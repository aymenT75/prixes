"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Arrow, Icon } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { api } from "@/lib/api";
import { rememberedStore } from "@/lib/courses";
import { useSpeakOnOpen } from "@/lib/say";
import { useApp } from "@/lib/store";
import { useA11y } from "@/lib/useA11y";

/**
 * Home: three very large buttons and nothing else. Speaking comes first, because
 * from there everything else can be done without touching the screen again.
 */
export default function HomePage() {
  const { user } = useApp();
  const setVoiceOpen = useA11y((s) => s.setVoiceOpen);
  const { data: list } = useQuery({
    queryKey: ["shopping"],
    queryFn: () => api.getShoppingList(),
    enabled: !!user,
  });
  const left = list?.items.filter((i) => !i.checked).length ?? null;
  // Read after mount: the static export has no storage while it renders.
  const [store, setStore] = useState<string | null>(null);
  useEffect(() => setStore(rememberedStore()), []);

  const name = user?.username?.split(" ")[0];
  useSpeakOnOpen(`Bonjour${name ? ` ${name}` : ""}. Parler, ma liste, ou où aller ?`);

  return (
    <div className="screen screen-home">
      <div className="screen-top">
        <div className="flex min-h-16 items-center justify-between">
          <LogoMark className="h-16 w-16" />
          <Link href="/account" aria-label="Réglages" className="round-btn">
            <Icon name="settings" className="text-[32px]" />
          </Link>
        </div>
        <h1 className="mt-3.5 text-on-surface">
          <span className="block text-[40px] font-bold leading-[1.05]">Bonjour{name ? ` ${name}` : ""},</span>{" "}
          <span className="mt-1.5 block text-[26px] leading-tight text-on-surface-variant">
            que voulez-vous faire&nbsp;?
          </span>
        </h1>
      </div>

      <button
        onClick={() => setVoiceOpen(true)}
        className="sheet tone-gold min-h-[220px] flex-1 flex-col overflow-hidden justify-center gap-11 pb-[50px] text-[60px]"
      >
        <span className="mic-disc breathe">
          <svg aria-hidden className="mic-rings pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" width="240" height="240" fill="none" stroke="#14213D" strokeWidth="1.5">
            <circle cx="120" cy="120" r="76" strokeOpacity=".6" />
            <circle cx="120" cy="120" r="92" strokeOpacity=".3" />
          </svg>
          <Icon name="mic" fill className="text-[70px]" />
        </span>
        <span className="relative">Parler</span>
      </button>
      <Link href="/list" className="sheet tone-n1">
        <Icon name="checklist" className="text-[46px]" />
        <span className="grow-text">
          Ma liste
          {left != null && <small>{left === 0 ? "Vide" : `${left} produit${left > 1 ? "s" : ""}`}</small>}
        </span>
        <Arrow />
      </Link>
      <Link href="/ou-aller" className="sheet tone-n2">
        <Icon name="near_me" className="text-[46px]" />
        <span className="grow-text">
          Où aller
          {store && <small>Dernier magasin : {store}</small>}
        </span>
        <Arrow />
      </Link>
    </div>
  );
}
