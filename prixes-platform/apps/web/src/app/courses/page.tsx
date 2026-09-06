"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/ApiErrorBoundary";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ProductCard } from "@/components/ProductCard";
import { ScoreLegend } from "@/components/ScoreLegend";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/useApiQuery";
import { useNearbyStores } from "@/lib/useNearbyStores";

export default function CoursesPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-on-surface-variant">Chargement…</div>}>
      <CoursesInner />
    </Suspense>
  );
}

function CoursesInner() {
  const params = useSearchParams();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  // Voice assistant navigates here with ?q=… — pick it up and search.
  useEffect(() => {
    const q = params.get("q");
    if (q) {
      setInput(q);
      setQuery(q.trim());
    }
  }, [params]);

  const searching = query.length >= 2;
  const { stores, state: geoState, ask } = useNearbyStores();

  const { data, isFetching, error, refetch } = useApiQuery({
    queryKey: ["products", searching ? query : "browse", stores.join(",")],
    queryFn: () =>
      searching ? api.searchProducts(query, 1, stores) : api.browseProducts(),
  });

  // The healthiest hit, shown after the price ranking rather than inside it:
  // the list answers "what does this cost", this answers "and if I ate better".
  // Only worth a card when it is not already the cheapest — otherwise it just
  // repeats the first row.
  const healthier = useMemo(() => {
    // Only among the results actually being read, and only ones we can price:
    // a suggestion fished from the bottom of forty rows stops being about this
    // search, and one with no price is not something you can decide to buy.
    const items = ((searching ? data?.items : undefined) ?? []).slice(0, 15);
    const graded = items.filter(
      (p) => /^[ab]$/i.test(p.nutriscore ?? "") && p.best_price != null,
    );
    if (graded.length === 0) return null;
    const best = graded.reduce((a, b) =>
      (a.nutriscore ?? "z").toLowerCase() <= (b.nutriscore ?? "z").toLowerCase() ? a : b,
    );
    return best.barcode === items[0]?.barcode ? null : best;
  }, [data, searching]);

  return (
    <div>
      <PageHeader title="Courses" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input.trim());
        }}
        className="mb-5 flex items-center gap-2 rounded-full border border-outline-variant/40 bg-surface-container-lowest px-4 py-2.5 shadow-card focus-within:border-primary"
      >
        <Icon name="search" className="text-on-surface-variant" />
        <input
          className="flex-1 bg-transparent text-body-md outline-none"
          placeholder="Rechercher un produit…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Link href="/scanner" className="text-primary">
          <Icon name="qr_code_scanner" />
        </Link>
      </form>

      <div className="mb-3 flex items-center justify-between gap-2">
        {!searching ? (
          <h2 className="flex items-center gap-2 text-headline-md text-on-surface">
            <Icon name="trending_up" className="text-primary" /> Produits populaires
          </h2>
        ) : (
          <span />
        )}
        <ScoreLegend />
      </div>

      {searching && geoState === "idle" && (
        <button
          onClick={ask}
          className="mb-4 flex w-full items-center gap-2 rounded-xl bg-surface-container p-3 text-left text-body-md text-on-surface-variant active:scale-[0.99]"
        >
          <Icon name="my_location" className="text-[20px] text-primary" />
          Classer selon les magasins près de moi
        </button>
      )}
      {searching && geoState === "denied" && (
        <p className="mb-4 text-micro text-on-surface-variant">
          Position refusée — les prix sont classés du moins cher, toutes enseignes
          confondues.
        </p>
      )}
      {searching && data?.ranked_by_nearby && (
        <p className="mb-3 flex items-center gap-1 text-micro text-on-surface-variant">
          <Icon name="my_location" className="text-[14px] text-primary" />
          Meilleur prix dans les magasins autour de vous, en premier.
        </p>
      )}

      {error && <ApiError error={error} onRetry={() => refetch()} />}

      {!error && isFetching && <p className="py-8 text-center text-on-surface-variant">Chargement…</p>}

      {!error && (
        <div className="space-y-3">
          {data?.items.map((p) => (
            <ProductCard key={p.barcode} product={p} />
          ))}
          {healthier && (
            <section className="pt-2" aria-labelledby="healthier-title">
              <h2
                id="healthier-title"
                className="mb-2 flex items-center gap-2 text-headline-md text-on-surface"
              >
                <Icon name="eco" className="text-primary" /> Meilleur pour la santé
              </h2>
              <p className="mb-2 text-micro text-on-surface-variant">
                Nutri-Score {healthier.nutriscore?.toUpperCase()} parmi ces résultats.
              </p>
              <ProductCard product={healthier} />
            </section>
          )}
          {data?.items.length === 0 && !isFetching && (
            <div className="card flex flex-col items-center gap-2 p-10 text-center text-on-surface-variant">
              <Icon name="grocery" className="text-[36px] text-outline-variant" />
              <p className="text-body-md">
                {searching ? "Aucun produit trouvé." : "Catalogue vide — lancez le seed des données."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
