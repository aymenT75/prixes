"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { eur } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { PriceAlert } from "@/lib/types";

export default function AlertsPage() {
  const { user, openLogin } = useApp();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => api.listAlerts(),
    enabled: !!user,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["alerts"] });
  const ack = useMutation({ mutationFn: (id: string) => api.ackAlert(id), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api.removeAlert(id), onSuccess: invalidate });

  if (!user) {
    return (
      <div>
        <PageHeader title="Mes alertes" />
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Icon name="notifications" className="text-[48px] text-outline-variant" />
          <p className="text-on-surface-variant">
            Connectez-vous pour suivre les baisses de prix.
          </p>
          <button onClick={() => openLogin(true)} className="btn-primary">
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];
  const triggered = items.filter((a) => a.triggered_at && !a.acknowledged);
  const watching = items.filter((a) => !a.triggered_at || a.acknowledged);

  return (
    <div>
      <PageHeader title="Mes alertes" />

      {isLoading && <p className="py-10 text-center text-on-surface-variant">Chargement…</p>}

      {!isLoading && items.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-on-surface-variant">
          <Icon name="notifications_off" className="text-[36px] text-outline-variant" />
          <p className="text-body-md">Aucune alerte pour l&apos;instant.</p>
          <p className="text-micro">
            Ouvrez une fiche produit et touchez « M&apos;alerter » pour être prévenu d&apos;une baisse.
          </p>
        </div>
      )}

      {triggered.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-headline-md text-primary">
            <Icon name="trending_down" fill /> Baisses détectées
          </h2>
          <div className="space-y-2">
            {triggered.map((a) => (
              <AlertRow key={a.id} alert={a} triggered onAck={() => ack.mutate(a.id)} onRemove={() => remove.mutate(a.id)} />
            ))}
          </div>
        </section>
      )}

      {watching.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-headline-md text-on-surface">
            <Icon name="visibility" /> Sous surveillance
          </h2>
          <div className="space-y-2">
            {watching.map((a) => (
              <AlertRow key={a.id} alert={a} onRemove={() => remove.mutate(a.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AlertRow({
  alert,
  triggered = false,
  onAck,
  onRemove,
}: {
  alert: PriceAlert;
  triggered?: boolean;
  onAck?: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`card flex items-center gap-3 p-3 ${
        triggered ? "border-2 border-primary bg-primary-container/20" : ""
      }`}
    >
      <Link
        href={`/courses/${alert.barcode}`}
        className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-white"
      >
        {alert.image_url ? (
          <Image src={alert.image_url} alt={alert.name ?? ""} fill className="object-contain p-1" sizes="48px" />
        ) : (
          <div className="flex h-full items-center justify-center text-outline-variant">
            <Icon name="grocery" />
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate text-label-lg text-on-surface">{alert.name ?? alert.barcode}</p>
        {triggered ? (
          <p className="text-micro text-primary">
            Maintenant à {alert.triggered_price != null ? eur(alert.triggered_price) : "—"} !
          </p>
        ) : (
          <p className="text-micro text-on-surface-variant">
            {alert.target_price != null
              ? `Objectif ≤ ${eur(alert.target_price)}`
              : "Toute nouvelle baisse"}
            {alert.current_best != null && ` · actuel ${eur(alert.current_best)}`}
          </p>
        )}
      </div>

      {triggered && onAck && (
        <button onClick={onAck} aria-label="Vu" className="text-primary active:scale-90">
          <Icon name="check" className="text-[22px]" />
        </button>
      )}
      <button onClick={onRemove} aria-label="Supprimer" className="text-outline-variant hover:text-error">
        <Icon name="close" className="text-[20px]" />
      </button>
    </div>
  );
}
