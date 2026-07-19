"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { ApiError } from "@/components/ApiErrorBoundary";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ProductCard } from "@/components/ProductCard";
import { ScoreLegend } from "@/components/ScoreLegend";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/useApiQuery";

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
  const { data, isFetching, error, refetch } = useApiQuery({
    queryKey: ["products", searching ? query : "browse"],
    queryFn: () => (searching ? api.searchProducts(query) : api.browseProducts()),
  });

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

      {error && <ApiError error={error} onRetry={() => refetch()} />}

      {!error && isFetching && <p className="py-8 text-center text-on-surface-variant">Chargement…</p>}

      {!error && (
        <div className="space-y-3">
          {data?.items.map((p) => (
            <ProductCard key={p.barcode} product={p} />
          ))}
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
