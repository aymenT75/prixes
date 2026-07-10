"use client";

import { useQuery } from "@tanstack/react-query";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ApiError, api } from "@/lib/api";
import { useApp } from "@/lib/store";

function Stars({ n }: { n: number | null }) {
  if (!n) return <span className="text-micro text-on-surface-variant">— pas de note</span>;
  return (
    <span className="inline-flex" aria-label={`${n} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon
          key={i}
          name="star"
          fill={i <= n}
          className={`text-[16px] ${i <= n ? "text-primary" : "text-outline-variant"}`}
        />
      ))}
    </span>
  );
}

export default function AdminFeedbackPage() {
  const { user } = useApp();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "feedback"],
    queryFn: () => api.listFeedback(200),
    retry: false,
  });

  const forbidden = error instanceof ApiError && error.status === 403;
  const needsLogin = !user;

  return (
    <div>
      <PageHeader title="Avis reçus" back />

      {(needsLogin || forbidden) && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-on-surface-variant">
          <Icon name="lock" className="text-[40px] text-outline-variant" />
          <p className="max-w-xs text-body-md">
            {needsLogin
              ? "Connectez-vous avec un compte administrateur pour consulter les avis."
              : "Accès réservé aux administrateurs."}
          </p>
        </div>
      )}

      {!needsLogin && !forbidden && (
        <>
          {isLoading && (
            <p className="py-10 text-center text-on-surface-variant">Chargement des avis…</p>
          )}

          {data && (
            <>
              {/* Summary */}
              <section className="mb-6 grid grid-cols-2 gap-gutter">
                <div className="card p-4 text-center">
                  <p className="text-micro uppercase tracking-wider text-on-surface-variant">
                    Total
                  </p>
                  <p className="text-headline-lg text-primary">{data.total}</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-micro uppercase tracking-wider text-on-surface-variant">
                    Note moyenne
                  </p>
                  <p className="text-headline-lg text-primary">
                    {data.average_rating != null ? `${data.average_rating.toFixed(1)}★` : "—"}
                  </p>
                </div>
              </section>

              {/* Distribution */}
              {data.average_rating != null && (
                <section className="card mb-6 space-y-1.5 p-4">
                  {[5, 4, 3, 2, 1].map((n) => {
                    const c = data.rating_counts[n] ?? 0;
                    const max = Math.max(1, ...Object.values(data.rating_counts));
                    return (
                      <div key={n} className="flex items-center gap-2 text-label-md">
                        <span className="w-6 text-on-surface-variant">{n}★</span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${(c / max) * 100}%` }}
                          />
                        </span>
                        <span className="w-6 text-right text-on-surface-variant">{c}</span>
                      </div>
                    );
                  })}
                </section>
              )}

              {/* List */}
              <div className="space-y-3">
                {data.items.length === 0 && (
                  <p className="py-8 text-center text-on-surface-variant">
                    Aucun avis pour l&apos;instant.
                  </p>
                )}
                {data.items.map((f) => (
                  <div key={f.id} className="card p-4">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <Stars n={f.rating} />
                      <span className="text-micro text-on-surface-variant">
                        {new Date(f.created_at).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-body-md text-on-surface">{f.message}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-micro text-on-surface-variant">
                      {f.email && (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="mail" className="text-[13px]" /> {f.email}
                        </span>
                      )}
                      {f.page && (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="link" className="text-[13px]" /> {f.page}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Icon name="person" className="text-[13px]" />
                        {f.user_id ? "membre" : "visiteur"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
