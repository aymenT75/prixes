"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { NovaBadge, ScoreBadge } from "@/components/ScoreBadge";
import { api } from "@/lib/api";
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

  function quickAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return openLogin(true);
    add.mutate();
  }

  return (
    <Link
      href={`/courses/${product.barcode}`}
      className="card flex items-center gap-4 p-3 transition-shadow hover:shadow-float"
    >
      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-white">
        {product.image_url ? (
          <Image src={product.image_url} alt={product.name ?? ""} fill className="object-contain p-1" sizes="64px" />
        ) : (
          <div className="flex h-full items-center justify-center text-outline-variant">
            <Icon name="grocery" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-label-lg text-on-surface">{product.name ?? "Produit"}</p>
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
        aria-label="Ajouter à ma liste"
        className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-primary active:scale-90"
      >
        <Icon name={added ? "check" : "add_shopping_cart"} className="text-[20px]" />
      </button>
    </Link>
  );
}
