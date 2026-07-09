"use client";

// Interactive Leaflet + OpenStreetMap map: the user's position, the target store
// pinned, and the driving route between them (OSRM, best-effort). Client-only —
// import it via next/dynamic with { ssr: false }. Leaflet touches `window` and its
// default marker icons break under bundlers, so we use pure-HTML divIcons instead.
import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";

import { Icon } from "@/components/Icon";

export interface MapStore {
  name: string;
  address: string | null;
  lat: number;
  lon: number;
  distance_km: number;
}

type LatLon = { lat: number; lon: number };

const storeIcon = L.divIcon({
  className: "",
  html: `<div style="display:grid;place-items:center;width:34px;height:34px;border-radius:50% 50% 50% 0;
    background:rgb(var(--color-primary));transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.4);
    border:2px solid #fff">
    <span style="transform:rotate(45deg);color:#fff;font-size:18px;line-height:1">🛒</span></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -34],
});

const userIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;
    border:3px solid #fff;box-shadow:0 0 0 3px rgba(37,99,235,.35)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Fit the viewport to both points (plus the route) once they're known.
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(points, { padding: [48, 48] });
  }, [map, points]);
  return null;
}

export default function StoreMap({ user, store }: { user: LatLon; store: MapStore }) {
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [info, setInfo] = useState<{ km: number; min: number } | null>(null);

  // OSRM public demo server — best-effort. On failure we simply draw a straight line.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url =
          `https://router.project-osrm.org/route/v1/driving/` +
          `${user.lon},${user.lat};${store.lon},${store.lat}` +
          `?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        const r = data?.routes?.[0];
        if (!alive || !r) return;
        setRoute(r.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon]));
        setInfo({ km: r.distance / 1000, min: Math.round(r.duration / 60) });
      } catch {
        /* keep the straight-line fallback */
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, store]);

  const line: [number, number][] = route ?? [
    [user.lat, user.lon],
    [store.lat, store.lon],
  ];
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${user.lat},${user.lon}&destination=${store.lat},${store.lon}&travelmode=driving`;

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-xl border border-outline-variant/20 shadow-card">
        <MapContainer
          center={[store.lat, store.lon]}
          zoom={15}
          scrollWheelZoom
          style={{ height: "60vh", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[store.lat, store.lon]} icon={storeIcon}>
            <Popup>
              <strong>{store.name}</strong>
              {store.address && (
                <>
                  <br />
                  {store.address}
                </>
              )}
            </Popup>
          </Marker>
          <Marker position={[user.lat, user.lon]} icon={userIcon}>
            <Popup>Vous êtes ici</Popup>
          </Marker>
          <Polyline
            positions={line}
            pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.75 }}
          />
          <FitBounds points={line} />
        </MapContainer>
      </div>

      {/* Store summary + directions */}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface-container-low p-4">
        <div className="min-w-0">
          <p className="truncate text-label-lg text-on-surface">{store.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-body-md text-on-surface-variant">
            <Icon name="near_me" className="text-[16px]" />
            {info ? `${info.km.toFixed(1)} km · ~${info.min} min en voiture` : `${store.distance_km} km`}
          </p>
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Itinéraire vers ${store.name} (nouvelle fenêtre)`}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-4 py-2.5 text-label-md text-on-primary active:scale-95"
        >
          <Icon name="directions" className="text-[18px]" /> Itinéraire
        </a>
      </div>
    </div>
  );
}
