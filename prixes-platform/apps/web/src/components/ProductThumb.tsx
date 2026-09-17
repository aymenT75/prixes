/**
 * La vignette d'un produit, où qu'il apparaisse.
 *
 * Four screens drew this box themselves and each one fell back to the same grey
 * icon. Weighed produce has no photo to fall back from, so the fallback had to
 * get smarter in four places at once — which is the moment it belongs in one.
 */

import Image from "next/image";

import { Icon } from "@/components/Icon";
import { produceEmoji } from "@/lib/produce";

export function ProductThumb({
  barcode,
  imageUrl,
  name,
  size,
  className = "",
}: {
  barcode?: string | null;
  imageUrl?: string | null;
  name?: string | null;
  /** Rendered box side in px — also what `next/image` is told to fetch. */
  size: number;
  className?: string;
}) {
  const emoji = produceEmoji(barcode);

  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt={name ?? ""}
        fill
        className={`object-contain ${className}`}
        sizes={`${size}px`}
        // Served straight from Open Food Facts, not through /_next/image. Their
        // image host answers in 7 to 20 s, and Next's optimiser gives up after
        // 7: nearly every product photo came back 504 and never got cached.
        // OFF already serves 400 px JPEGs — small enough for a thumbnail — and
        // skipping the optimiser also spares the droplet a sharp resize per
        // image on a machine that is short of memory.
        unoptimized
      />
    );
  }

  if (emoji) {
    return (
      <div
        aria-hidden
        className="grid h-full w-full place-items-center bg-primary-fixed-dim/10"
        // Sized off the box rather than a fixed class so the same component
        // works at 40px in a draft row and 176px on the product page.
        style={{ fontSize: Math.round(size * 0.55) }}
      >
        {emoji}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center text-outline-variant">
      <Icon name={barcode ? "grocery" : "edit_note"} style={{ fontSize: Math.round(size * 0.4) }} />
    </div>
  );
}
