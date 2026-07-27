"use client";

import Image from "next/image";
import Link from "next/link";

import { Icon } from "@/components/Icon";
import { eur } from "@/lib/format";
import type { Bargain } from "@/lib/types";

// Compact horizontal-scroll card for the home "Bonnes affaires" section — a real
// price drop from our own price history (not a submitted/unverified deal).
export function BargainCard({ bargain }: { bargain: Bargain }) {
  const pct = Math.round(bargain.drop_pct * 100);
  const label =
    `${bargain.name ?? "Produit"}${bargain.brand ? `, ${bargain.brand}` : ""}` +
    `, ${eur(bargain.price)} chez ${bargain.store ?? "un magasin"}, ${pct} pour cent moins cher qu'avant`;

  return (
    <Link
      href={`/courses/detail?barcode=${bargain.barcode}`}
      aria-label={label}
      className="card relative flex w-40 flex-shrink-0 flex-col gap-2 p-3 active:scale-95"
    >
      <span className="absolute left-2 top-2 z-10 rounded-full bg-error px-2 py-0.5 text-micro font-bold text-on-error">
        −{pct}%
      </span>
      <div className="relative h-24 w-full overflow-hidden rounded-lg bg-white">
        {bargain.image_url ? (
          <Image src={bargain.image_url} alt="" fill className="object-contain p-1" sizes="160px" />
        ) : (
          <div className="flex h-full items-center justify-center text-outline-variant">
            <Icon name="grocery" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-label-md text-on-surface">{bargain.name ?? "Produit"}</p>
        {bargain.store && (
          <p className="truncate text-micro uppercase text-on-surface-variant">{bargain.store}</p>
        )}
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-label-lg font-bold text-primary">{eur(bargain.price)}</span>
          <span className="text-micro text-on-surface-variant line-through">
            {eur(bargain.reference_price)}
          </span>
        </div>
      </div>
    </Link>
  );
}
