"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { NovaBadge, ScoreBadge } from "@/components/ScoreBadge";
import { api } from "@/lib/api";
import { nutriHint, scoreColor } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { Product } from "@/lib/types";

export function ProductCard({ product }: { product: Product }) {
  const { user, openLogin } = useApp();
  const qc = useQueryClient();
  const [added, setAdded] = useState(false);

  const add = useMutation({
    mutationFn: () =>
      api.addToList({ barcode: product.barcode, name: product.name ?? undefined }),
    onSuccess: () => {
      setAdded(true);
      qc.invalidateQueries({ queryKey: ["shopping"] });
    },
  });

  function quickAdd() {
    if (!user) return openLogin(true);
    add.mutate();
  }

  // Colour the whole product bar by Nutri-Score for low-vision users: green (A) →
  // red (E), so an unhealthy product (D/E) reads as orange/red at a glance. A tinted
  // background (theme-aware via color-mix, so text contrast stays high) plus a strong
  // border/left accent. The letter badge + spoken hint keep it accessible to blind
  // users and satisfy "don't rely on colour alone".
  const nutri = product.nutriscore?.toLowerCase() ?? null;
  const nutriColor = nutri ? scoreColor[nutri] : null;
  const hint = nutri ? (nutriHint[nutri] ?? "") : "";
  const nutriStyle: React.CSSProperties | undefined = nutriColor
    ? {
        borderColor: nutriColor,
        borderWidth: 2,
        borderLeftWidth: 6,
        backgroundColor: `color-mix(in srgb, ${nutriColor} 10%, rgb(var(--color-surface-container-lowest)))`,
      }
    : undefined;
  const linkLabel =
    `${product.name ?? "Produit"}${product.brand ? `, ${product.brand}` : ""}` +
    (nutri ? ` — Nutri-Score ${nutri.toUpperCase()}, ${hint}` : "") +
    " — voir la fiche produit";

  // "Stretched link" pattern: the whole card is clickable, but there's exactly one
  // real link (the product name, labelled for screen readers) — the "Ajouter" button
  // sits above the stretched overlay (z-10) so it stays independently operable. This
  // avoids nesting a <button> inside an <a> (invalid + confusing for assistive tech).
  return (
    <div
      style={nutriStyle}
      className="card relative flex items-center gap-4 p-3 transition-shadow hover:shadow-float focus-within:shadow-float"
    >
      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-white">
        {product.image_url ? (
          <Image src={product.image_url} alt="" fill className="object-contain p-1" sizes="64px" />
        ) : (
          <div className="flex h-full items-center justify-center text-outline-variant">
            <Icon name="grocery" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-label-lg text-on-surface">
          <Link
            href={`/courses/detail?barcode=${product.barcode}`}
            aria-label={linkLabel}
            className="after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline"
          >
            {product.name ?? "Produit"}
          </Link>
        </p>
        {product.brand && <p className="truncate text-micro uppercase text-on-surface-variant">{product.brand}</p>}
        <div className="mt-1.5 flex flex-wrap gap-1">
          <ScoreBadge kind="Nutri" grade={product.nutriscore} />
          <ScoreBadge kind="Eco" grade={product.ecoscore} />
          <NovaBadge group={product.nova_group} />
        </div>
      </div>
      <button
        onClick={quickAdd}
        disabled={add.isPending || added}
        aria-label={added ? "Ajouté à ma liste" : `Ajouter ${product.name ?? "ce produit"} à ma liste`}
        className="relative z-10 grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-primary active:scale-90"
      >
        <Icon name={added ? "check" : "add_shopping_cart"} className="text-[20px]" />
      </button>
    </div>
  );
}
