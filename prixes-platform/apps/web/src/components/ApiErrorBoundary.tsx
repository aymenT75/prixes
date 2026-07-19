"use client";

import { Icon } from "@/components/Icon";

interface ApiErrorProps {
  error: Error | null;
  onRetry?: () => void;
  fallback?: React.ReactNode;
}

export function ApiError({ error, onRetry, fallback }: ApiErrorProps) {
  if (!error) return null;

  const isTimeout = error.message.includes("timeout") || error.message.includes("TimeoutError");
  const is404 = error.message.includes("404");

  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <Icon
        name={is404 ? "search_off" : isTimeout ? "cloud_off" : "error"}
        className="text-[48px] text-error"
      />
      <div>
        <h3 className="text-headline-md text-on-surface">
          {is404 ? "Pas trouvé" : isTimeout ? "Connexion lente" : "Erreur réseau"}
        </h3>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {is404
            ? "Aucun résultat ne correspond à votre recherche."
            : isTimeout
              ? "La requête prend trop de temps. Réessayez."
              : "Une erreur est survenue. Réessayez."}
        </p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary">
          <Icon name="refresh" className="text-[18px]" /> Réessayer
        </button>
      )}
      {fallback && <div className="mt-2 text-body-sm text-on-surface-variant">{fallback}</div>}
    </div>
  );
}
