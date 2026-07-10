"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ApiError, api } from "@/lib/api";
import { useApp } from "@/lib/store";

const RANGES = [7, 14, 30];

export default function AdminAnalyticsPage() {
  const { user } = useApp();
  const [days, setDays] = useState(14);
  const { data, isFetching, error } = useQuery({
    queryKey: ["admin", "analytics", days],
    queryFn: () => api.analyticsSummary(days),
    retry: false,
  });

  const forbidden = error instanceof ApiError && error.status === 403;

  if (!user || forbidden) {
    return (
      <div>
        <PageHeader title="Statistiques" back />
        <div className="flex flex-col items-center gap-3 py-16 text-center text-on-surface-variant">
          <Icon name="lock" className="text-[40px] text-outline-variant" />
          <p className="max-w-xs text-body-md">
            {!user
              ? "Connectez-vous avec un compte administrateur pour voir les statistiques."
              : "Accès réservé aux administrateurs."}
          </p>
        </div>
      </div>
    );
  }

  const maxPath = Math.max(1, ...(data?.top_paths.map((p) => p.count) ?? [1]));

  return (
    <div>
      <PageHeader title="Statistiques" back />

      <div className="mb-5 flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setDays(r)}
            className={`chip ${days === r ? "chip-active" : "chip-idle"}`}
          >
            {r} j
          </button>
        ))}
      </div>

      {isFetching && <p className="py-8 text-center text-on-surface-variant">Chargement…</p>}

      {data && (
        <>
          <section className="mb-6 grid grid-cols-2 gap-gutter">
            <div className="card p-4 text-center">
              <p className="text-micro uppercase tracking-wider text-on-surface-variant">
                Visiteurs (sessions)
              </p>
              <p className="text-headline-lg text-primary">{data.unique_sessions}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-micro uppercase tracking-wider text-on-surface-variant">
                Événements
              </p>
              <p className="text-headline-lg text-primary">{data.total_events}</p>
            </div>
          </section>

          <section className="mb-6">
            <h3 className="mb-3 flex items-center gap-2 text-headline-md text-on-surface">
              <Icon name="bar_chart" className="text-primary" /> Écrans les plus vus
            </h3>
            <div className="card space-y-2 p-4">
              {data.top_paths.length === 0 && (
                <p className="text-body-md text-on-surface-variant">Pas encore de données.</p>
              )}
              {data.top_paths.map((p) => (
                <div key={p.path} className="flex items-center gap-3 text-label-md">
                  <span className="w-32 shrink-0 truncate text-on-surface" title={p.path}>
                    {p.path === "/" ? "Accueil" : p.path}
                  </span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${(p.count / maxPath) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 text-right text-on-surface-variant">{p.count}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-headline-md text-on-surface">
              <Icon name="touch_app" className="text-primary" /> Actions
            </h3>
            <div className="card divide-y divide-outline-variant/20 p-1">
              {data.by_event.map((e) => (
                <div key={e.event} className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-body-md text-on-surface">{e.event}</span>
                  <span className="text-label-lg text-primary">{e.count}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
