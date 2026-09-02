"use client";

/**
 * Importer une recette depuis un lien.
 *
 * Reads the schema.org/Recipe block that Cookidoo's public pages, Marmiton, 750g
 * and most recipe sites already publish for search engines. No model call, so no
 * cost and no rate limit.
 *
 * Two limits are stated in the interface rather than hidden: a Cookidoo recipe
 * behind a subscription is not readable, and we show the ingredients but not the
 * method, which belongs to its author.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { ApiError, api } from "@/lib/api";
import { eur } from "@/lib/format";
import { useA11y } from "@/lib/useA11y";
import type { ImportedRecipe } from "@/lib/types";

const IMPORT_DEADLINE_MS = 20_000;

export function RecipeImport() {
  const qc = useQueryClient();
  const { allergens } = useA11y();
  const [url, setUrl] = useState("");
  const [recipe, setRecipe] = useState<ImportedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const load = useMutation({
    mutationFn: async (link: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), IMPORT_DEADLINE_MS);
      try {
        return await api.importRecipe(link, allergens, controller.signal);
      } finally {
        clearTimeout(timer);
      }
    },
    onMutate: () => {
      setError(null);
      setAdded(null);
      setRecipe(null);
    },
    onSuccess: setRecipe,
    onError: (e) => {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("Le site n'a pas répondu à temps.");
      } else if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Impossible d'importer cette recette.");
      }
    },
  });

  const toList = useMutation({
    mutationFn: (current: ImportedRecipe) =>
      api.recipeToList(
        current.ingredients.map((line) => ({
          barcode: line.barcode,
          free_text: line.barcode ? null : line.product_name,
          name: line.matched_name ?? line.product_name,
          quantity: line.quantity,
          amount: line.amount,
          unit: line.unit,
        })),
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["shopping"] });
      setRecipe(null);
      setUrl("");
      setAdded(`${res.added} article${res.added > 1 ? "s" : ""} ajouté${res.added > 1 ? "s" : ""}`);
    },
    onError: () => setError("Les ingrédients n'ont pas pu être ajoutés."),
  });

  return (
    <section className="card mt-4 p-4" aria-labelledby="recipe-import-title">
      <div className="flex items-center gap-2">
        <Icon name="link" className="text-[20px] text-secondary" />
        <h2 id="recipe-import-title" className="text-label-lg text-on-surface">
          Importer une recette
        </h2>
      </div>
      <p className="mt-1 text-body-md text-on-surface-variant">
        Collez un lien (Cookidoo, Marmiton, un blog…) : je lis les ingrédients et je les chiffre.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) load.mutate(url.trim());
          }}
          placeholder="https://cookidoo.fr/recipes/…"
          aria-label="Lien de la recette"
          disabled={load.isPending}
          className="min-w-0 flex-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none disabled:opacity-60"
        />
        <button
          onClick={() => url.trim() && load.mutate(url.trim())}
          disabled={load.isPending || !url.trim()}
          className="btn-primary flex-shrink-0 px-4 disabled:opacity-50"
        >
          {load.isPending ? "…" : "Lire"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-error-container p-3 text-body-md text-on-error-container">
          {error}
        </p>
      )}
      {added && (
        <p role="status" className="mt-3 rounded-xl bg-primary-container p-3 text-body-md text-on-primary-container">
          {added}.
        </p>
      )}

      {recipe && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 text-headline-md text-on-surface">{recipe.title}</h3>
            <span className="flex-shrink-0 text-micro text-on-surface-variant">
              {recipe.servings} pers.
            </span>
          </div>

          <ul className="mt-2 space-y-1">
            {recipe.ingredients.map((line, i) => (
              <li
                key={`${line.product_name}-${i}`}
                className="flex items-baseline justify-between gap-3 border-b border-outline-variant py-1.5 last:border-0"
              >
                <span className="min-w-0 truncate text-body-md text-on-surface">
                  {line.matched_name ?? line.product_name}
                  {line.allergen_warning && (
                    <span className="ml-2 text-micro text-error">
                      contient {line.allergen_warning}
                    </span>
                  )}
                </span>
                <span className="flex-shrink-0 text-micro text-on-surface-variant">
                  {String(line.amount).replace(/\.0+$/, "").replace(".", ",")} {line.unit}
                  {line.best_price != null ? ` · ${eur(line.best_price)}` : " · prix inconnu"}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-container p-3">
            <div>
              <p className="text-micro uppercase tracking-wider text-on-surface-variant">
                Estimation
              </p>
              <p className="text-headline-md text-on-surface">{eur(recipe.estimated_total ?? 0)}</p>
            </div>
            {recipe.unpriced_count > 0 && (
              <p className="max-w-[55%] text-right text-micro text-on-surface-variant">
                {recipe.unpriced_count} sans prix connu, non compté
              </p>
            )}
          </div>

          <p className="mt-2 text-micro text-on-surface-variant">
            Ingrédients uniquement. Pour la préparation,{" "}
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              ouvrez la recette d&apos;origine
            </a>
            .
          </p>

          <button
            onClick={() => toList.mutate(recipe)}
            disabled={toList.isPending}
            className="btn-primary mt-3 w-full py-3 disabled:opacity-50"
          >
            <Icon name="playlist_add" className="text-[18px]" />
            {toList.isPending ? "Ajout…" : "Ajouter les ingrédients à ma liste"}
          </button>
        </div>
      )}
    </section>
  );
}
