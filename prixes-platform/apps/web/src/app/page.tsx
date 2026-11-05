"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
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
  const greeting = `Bonjour${name ? ` ${name}` : ""}, que voulez-vous faire ?`;
  useSpeakOnOpen(`Bonjour${name ? ` ${name}` : ""}. Parler, ma liste, ou où aller ?`);

  return (
    <div className="flex min-h-[calc(100dvh/var(--zoom-scale,1)-48px)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <LogoMark className="h-16 w-16" />
        <Link
          href="/account"
          aria-label="Réglages"
          className="grid h-16 w-16 place-items-center rounded-full border-[3px] border-[rgb(var(--color-btn-line))] text-on-surface active:scale-95"
        >
          <Icon name="settings" className="text-[36px]" />
        </Link>
      </div>

      <h1 className="text-balance text-[34px] font-bold leading-tight text-on-surface">{greeting}</h1>

      <button
        onClick={() => setVoiceOpen(true)}
        className="big-btn big-btn-main min-h-[160px] flex-1 justify-center text-[42px]"
      >
        <Icon name="mic" fill className="text-[64px]" /> Parler
      </button>
      <Link href="/list" className="big-btn">
        <Icon name="checklist" className="text-[44px]" />
        <span>
          Ma liste
          {left != null && <small>{left === 0 ? "Vide" : `${left} produit${left > 1 ? "s" : ""}`}</small>}
        </span>
      </Link>
      <Link href="/ou-aller" className="big-btn">
        <Icon name="near_me" className="text-[44px]" />
        <span>
          Où aller
          {store && <small>Dernier magasin : {store}</small>}
        </span>
      </Link>
    </div>
  );
}
