"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";
import type { GeocodeHit } from "@/lib/types";

const RADII = [1, 5, 10, 25];

export default function StoresPage() {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [radius, setRadius] = useState(5);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Fallback for anyone who declines the geolocation prompt (or just prefers
  // typing) — geolocation must never be the *only* way to use this feature.
  const [showAddressInput, setShowAddressInput] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeHit[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);

  async function locate() {
    setGeoError(null);
    try {
      setCoords(await getCurrentPosition());
    } catch (e) {
      setGeoError(
        e instanceof Error && e.message === "unsupported"
          ? "Géolocalisation non disponible."
          : "Position refusée. Activez la localisation.",
      );
      setShowAddressInput(true); // offer the alternative right away
    }
  }

  // Debounced address search-as-you-type.
  useEffect(() => {
    const q = addressQuery.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    setSearchingAddress(true);
    const t = setTimeout(() => {
      api
        .geocodeAddress(q)
        .then((r) => setSuggestions(r.items))
        .catch(() => setSuggestions([]))
        .finally(() => setSearchingAddress(false));
    }, 400);
    return () => clearTimeout(t);
  }, [addressQuery]);

  function pickAddress(hit: GeocodeHit) {
    setCoords({ lat: hit.lat, lon: hit.lon });
    setGeoError(null);
    setShowAddressInput(false);
    setSuggestions([]);
    setAddressQuery("");
  }

  const { data, isFetching } = useQuery({
    queryKey: ["stores", coords, radius],
    queryFn: () => api.storesNearby(coords!.lat, coords!.lon, radius),
    enabled: !!coords,
  });

  const stores = data?.items ?? [];
  // Show skeletons only when we have nothing to display yet (first load or a
  // radius change) — never hide already-visible results behind them.
  const loading = isFetching && stores.length === 0;

  return (
    <div>
      <PageHeader title="Magasins proches" />

      {coords && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {RADII.map((r) => (
            <button
              key={r}
              onClick={() => setRadius(r)}
              className={`chip ${radius === r ? "chip-active" : "chip-idle"}`}
            >
              {r} km
            </button>
          ))}
        </div>
      )}

      {!coords && (
        <>
          <p className="mb-3 text-body-md text-on-surface-variant">
            On a besoin de savoir où vous êtes pour trouver les magasins les plus proches —
            uniquement pour cette recherche, rien n&apos;est enregistré.
          </p>
          <button onClick={locate} className="btn-primary mb-3 w-full py-3">
            <Icon name="my_location" className="text-[18px]" /> Utiliser ma position
          </button>
          {!showAddressInput && (
            <button
              onClick={() => setShowAddressInput(true)}
              className="mb-4 w-full text-center text-label-lg text-primary underline-offset-2 hover:underline"
            >
              Ou saisir une adresse
            </button>
          )}
        </>
      )}
      {geoError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-warning-soft p-3 text-label-md text-secondary">
          <Icon name="warning" className="text-[18px]" /> {geoError}
        </div>
      )}

      {!coords && showAddressInput && (
        <div className="mb-5">
          <label htmlFor="address-input" className="mb-2 block text-label-lg text-on-surface-variant">
            Votre ville ou adresse
          </label>
          <div className="relative">
            <input
              id="address-input"
              type="text"
              inputMode="search"
              autoComplete="off"
              value={addressQuery}
              onChange={(e) => setAddressQuery(e.target.value)}
              placeholder="Ex. Lyon, ou 12 rue de la Paix, Paris"
              className="input"
            />
            {searchingAddress && (
              <Icon
                name="progress_activity"
                className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[18px] text-on-surface-variant"
              />
            )}
          </div>
          {suggestions.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-1.5">
              {suggestions.map((s) => (
                <li key={`${s.lat}-${s.lon}`}>
                  <button
                    onClick={() => pickAddress(s)}
                    className="flex w-full items-start gap-2 rounded-lg p-2.5 text-left text-body-md text-on-surface hover:bg-surface-container"
                  >
                    <Icon name="location_on" className="mt-0.5 flex-shrink-0 text-[18px] text-on-surface-variant" />
                    <span className="truncate">{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {addressQuery.trim().length >= 3 && !searchingAddress && suggestions.length === 0 && (
            <p className="mt-2 text-body-md text-on-surface-variant">Aucune adresse trouvée.</p>
          )}
        </div>
      )}

      <div className="space-y-4">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => <StoreCardSkeleton key={i} />)}
        {stores.map((s, i) => {
          const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
          return (
            <div
              key={s.id}
              className="card overflow-hidden p-gutter transition-all hover:shadow-float"
            >
              {i === 0 && (
                <div className="mb-2 inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-micro text-on-primary">
                  <Icon name="near_me" fill className="text-[12px]" /> Le plus proche
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-headline-md text-on-surface">
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${s.name}, à ${s.distance_km} km — voir l'itinéraire (nouvelle fenêtre)`}
                      className="hover:underline focus-visible:underline"
                    >
                      {s.name}
                    </a>
                  </h3>
                  {s.address && (
                    <p className="mt-1 flex items-center gap-1 text-body-md text-on-surface-variant">
                      <Icon name="location_on" className="text-[16px]" />
                      <span className="truncate">{s.address}</span>
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-headline-md text-primary">{s.distance_km}</span>
                  <span className="text-micro text-on-surface-variant">km</span>
                </div>
              </div>

              <div className="mt-4 flex items-center">
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Itinéraire vers ${s.name} (nouvelle fenêtre)`}
                  className="ml-auto flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-label-md text-on-primary active:scale-95"
                >
                  <Icon name="directions" className="text-[18px]" /> Itinéraire
                </a>
              </div>
            </div>
          );
        })}
        {coords && stores.length === 0 && !loading && (
          <p className="py-8 text-center text-on-surface-variant">
            Aucun magasin trouvé à proximité.
          </p>
        )}
      </div>
    </div>
  );
}

function StoreCardSkeleton() {
  return (
    <div className="card overflow-hidden p-gutter" aria-hidden>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-6 w-2/3 animate-pulse rounded bg-surface-container" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-surface-container" />
        </div>
        <div className="h-8 w-10 shrink-0 animate-pulse rounded bg-surface-container" />
      </div>
      <div className="mt-4 flex justify-end">
        <div className="h-9 w-28 animate-pulse rounded-lg bg-surface-container" />
      </div>
    </div>
  );
}
