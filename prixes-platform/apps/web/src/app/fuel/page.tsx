"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { eur } from "@/lib/format";
import { getCurrentPosition } from "@/lib/geo";

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

  // A refusal that arrives after a later attempt has already succeeded must not
  // put the warning back: on Android the permission dialog keeps the first call
  // pending, so the two resolve out of order.
  const attempt = useRef(0);

  async function locate() {
    const mine = ++attempt.current;
    setGeoError(null);
    try {
      const position = await getCurrentPosition();
      if (mine === attempt.current) setCoords(position);
    } catch (e) {
      if (mine !== attempt.current) return;
      setGeoError(
        e instanceof Error && e.message === "unsupported"
          ? "Géolocalisation non disponible."
          : "Position refusée. Activez la localisation.",
      );
    }
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

      {/* Google Play "Déclarations trompeuses": government data must credit its
          official source and state that Prixes is not a government app. */}
      <div className="mb-5 rounded-2xl border-2 border-primary/25 bg-surface-container p-4">
        <p className="flex items-start gap-2 text-body-md text-on-surface-variant">
          <Icon name="info" fill className="mt-0.5 flex-shrink-0 text-[18px] text-primary" />
          <span>
            Prix issus des données ouvertes officielles de l&apos;État français, déclarés
            par les stations. <strong className="text-on-surface">Prixes est une application indépendante</strong>,
            non affiliée à une entité gouvernementale.
          </span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="https://www.prix-carburants.gouv.fr/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface px-3 py-1.5 text-label-md text-primary"
          >
            <Icon name="open_in_new" className="flex-shrink-0 text-[16px]" /> prix-carburants.gouv.fr
          </a>
          <Link
            href="/sources"
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface px-3 py-1.5 text-label-md text-primary"
          >
            <Icon name="database" className="flex-shrink-0 text-[16px]" /> Toutes les sources
          </Link>
        </div>
      </div>

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
      {geoError && !coords && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-warning-soft p-3 text-label-md text-secondary">
          <Icon name="warning" className="text-[18px]" /> {geoError}
        </div>
      )}
      {isFetching && <p className="py-8 text-center text-on-surface-variant">Recherche des stations…</p>}

      <div className="space-y-4">
        {data?.items.map((s) => {
          const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
          return (
          <div key={s.id} className="card overflow-hidden p-gutter transition-all hover:shadow-float">
            {s.id === cheapest && (
              <div className="mb-2 inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-micro text-on-primary">
                <Icon name="verified" fill className="text-[12px]" /> Le moins cher
              </div>
            )}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-headline-md text-on-surface">
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Station ${s.brand ?? "essence"}${s.city ? ` à ${s.city}` : ""}, à ${s.distance_km} km — voir l'itinéraire (nouvelle fenêtre)`}
                    className="hover:underline focus-visible:underline"
                  >
                    {s.brand ?? "Station"}
                  </a>
                </h3>
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
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Itinéraire vers la station ${s.brand ?? "essence"} (nouvelle fenêtre)`}
                className="ml-auto flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-label-md text-on-primary active:scale-95"
              >
                <Icon name="directions" className="text-[18px]" /> Itinéraire
              </a>
            </div>
          </div>
          );
        })}
        {coords && data?.items.length === 0 && !isFetching && (
          <p className="py-8 text-center text-on-surface-variant">Aucune station trouvée à proximité.</p>
        )}
      </div>
    </div>
  );
}
