"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { eur } from "@/lib/format";

const FUEL_TYPES = [
  { id: "gazole", label: "Gazole" },
  { id: "sp95", label: "SP95" },
  { id: "sp98", label: "SP98" },
  { id: "e85", label: "E85" },
  { id: "gplc", label: "GPLc" },
];

export default function FuelPage() {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [fuelType, setFuelType] = useState("gazole");
  const [geoError, setGeoError] = useState<string | null>(null);

  function locate() {
    if (!navigator.geolocation) return setGeoError("Géolocalisation non disponible.");
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setGeoError("Position refusée. Activez la localisation."),
    );
  }

  const { data, isFetching } = useQuery({
    queryKey: ["fuel", coords, fuelType],
    queryFn: () => api.fuelNearby(coords!.lat, coords!.lon, fuelType),
    enabled: !!coords,
  });

  const cheapest = data?.items.find((s) => s.prices[fuelType] != null)?.id;

  return (
    <div>
      <PageHeader title="Carburant" />

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {FUEL_TYPES.map((f) => (
          <button
            key={f.id}
            onClick={() => setFuelType(f.id)}
            className={`chip ${fuelType === f.id ? "chip-active" : "chip-idle"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!coords && (
        <button onClick={locate} className="btn-primary mb-4 w-full py-3">
          <Icon name="my_location" className="text-[18px]" /> Trouver les stations proches
        </button>
      )}
      {geoError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-warning-soft p-3 text-label-md text-secondary">
          <Icon name="warning" className="text-[18px]" /> {geoError}
        </div>
      )}
      {isFetching && <p className="py-8 text-center text-on-surface-variant">Recherche des stations…</p>}

      <div className="space-y-4">
        {data?.items.map((s) => (
          <div key={s.id} className="card overflow-hidden p-gutter transition-all hover:shadow-float">
            {s.id === cheapest && (
              <div className="mb-2 inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-micro text-on-primary">
                <Icon name="verified" fill className="text-[12px]" /> Le moins cher
              </div>
            )}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-headline-md text-on-surface">{s.brand ?? "Station"}</h3>
                <p className="mt-1 flex items-center gap-1 text-body-md text-on-surface-variant">
                  <Icon name="location_on" className="text-[16px]" />
                  {s.city} {s.postal_code} · {s.distance_km} km
                </p>
              </div>
              <div className="text-right">
                <span className="block text-headline-md text-primary">
                  {s.prices[fuelType] != null ? eur(s.prices[fuelType]) : "—"}
                </span>
                <span className="text-micro text-on-surface-variant">{fuelType} / L</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {Object.entries(s.prices)
                .filter(([k]) => k !== fuelType)
                .slice(0, 2)
                .map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-1.5 text-label-md text-on-surface"
                  >
                    {k.toUpperCase()}: <span className="text-primary">{eur(v)}</span>
                  </div>
                ))}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-label-md text-on-primary active:scale-95"
              >
                <Icon name="directions" className="text-[18px]" /> Itinéraire
              </a>
            </div>
          </div>
        ))}
        {coords && data?.items.length === 0 && !isFetching && (
          <p className="py-8 text-center text-on-surface-variant">Aucune station trouvée à proximité.</p>
        )}
      </div>
    </div>
  );
}
