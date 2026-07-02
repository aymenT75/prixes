"use client";

import { useEffect } from "react";

import { Icon } from "@/components/Icon";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console (and any monitoring) for diagnosis.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <Icon name="error" className="text-[56px] text-error" />
      <h1 className="text-headline-lg text-on-surface">Une erreur est survenue</h1>
      <p className="max-w-xs text-body-md text-on-surface-variant">
        Désolé, quelque chose s&apos;est mal passé. Réessayez.
      </p>
      <button onClick={reset} className="btn-primary">
        <Icon name="refresh" className="text-[18px]" /> Réessayer
      </button>
    </div>
  );
}
