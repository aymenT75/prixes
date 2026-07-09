"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";

const RADII = [1, 5, 10, 25];

export default function StoresPage() {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [radius, setRadius] = useState(5);
  const [geoError, setGeoError] = useState<string | null>(null);

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
    }
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
        <button onClick={locate} className="btn-primary mb-4 w-full py-3">
          <Icon name="my_location" className="text-[18px]" /> Trouver les magasins proches
        </button>
      )}
      {geoError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-warning-soft p-3 text-label-md text-secondary">
          <Icon name="warning" className="text-[18px]" /> {geoError}
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
