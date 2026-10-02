"use client";

/**
 * "Depuis votre dernière visite" on the home page: the list's price drops and a
 * Sunday menu waiting — what the assistant says when it next opens, shown to
 * whoever reads rather than listens. Gone once told or dismissed.
 */

import Link from "next/link";
import { useEffect } from "react";

import { Icon } from "@/components/Icon";
import { loadNews, markMenuOffered, markNewsTold, useNews } from "@/lib/news";

export function NewsCard() {
  const drops = useNews((s) => s.drops);
  const menuWeek = useNews((s) => s.menuWeek);
  useEffect(() => {
    void loadNews();
  }, []);

  if (!drops.length && !menuWeek) return null;
  return (
    <section aria-labelledby="news-title" className="card mb-6 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="news-title" className="flex items-center gap-2 text-label-lg text-on-surface">
          <Icon name="trending_down" className="text-primary" /> Depuis votre dernière visite
        </h2>
        <button
          onClick={() => {
            markNewsTold();
            if (menuWeek) markMenuOffered();
          }}
          aria-label="Masquer les nouvelles"
          className="grid h-11 w-11 place-items-center rounded-full text-on-surface-variant"
        >
          <Icon name="close" />
        </button>
      </div>
      <ul className="space-y-2">
        {drops.slice(0, 4).map((d) => (
          <li key={d.barcode + d.at}>
            <Link
              href={`/courses/detail?barcode=${encodeURIComponent(d.barcode)}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-surface-container px-3 py-2"
            >
              <span className="min-w-0 break-words text-body-md text-on-surface">{d.name}</span>
              <span className="flex-shrink-0 text-label-md font-semibold text-primary">
                {Number(d.new).toFixed(2).replace(".", ",")} €{" "}
                <span className="font-normal text-on-surface-variant">
                  (−{(Number(d.old) - Number(d.new)).toFixed(2).replace(".", ",")} €)
                </span>
              </span>
            </Link>
          </li>
        ))}
        {menuWeek && (
          <li>
            <Link
              href="/menu"
              className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-body-md font-semibold text-primary"
            >
              <Icon name="restaurant_menu" /> Votre menu de la semaine est prêt
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
