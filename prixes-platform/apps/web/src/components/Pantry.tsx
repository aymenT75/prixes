"use client";

/**
 * Mon placard: what the household said it already has (« Je l'ai déjà »).
 * Lists, recipes and the weekly menu leave these out for two weeks, and the
 * menu uses them first. A cross takes one back out of the cupboard.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { eur } from "@/lib/format";

export function Pantry() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["pantry"], queryFn: () => api.getPantry() });
  const remove = useMutation({
    mutationFn: (id: string) => api.removeFromPantry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pantry"] }),
  });
  const items = data ?? [];
  if (!items.length) return null;
  const saved = items.reduce((s, i) => s + Number(i.avoided ?? 0), 0);

  return (
    <details className="card mt-4 p-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-label-lg text-on-surface">
        <span className="flex items-center gap-2">
          <Icon name="kitchen" className="text-[20px]" /> Mon placard · {items.length}
        </span>
        {saved > 0 && <span className="text-body-md text-tertiary">{eur(saved)} pas rachetés</span>}
      </summary>
      <p className="mt-1 text-body-md text-on-surface-variant">
        Vous les avez déjà : ils ne reviennent pas dans vos listes pendant 2 semaines, et le menu les utilise en
        premier.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-1 rounded-full bg-surface-container py-1 pl-3 pr-1 text-body-md">
            {i.name}
            <button
              onClick={() => remove.mutate(i.id)}
              aria-label={`Retirer ${i.name} du placard`}
              className="grid h-9 w-9 place-items-center rounded-full text-on-surface-variant"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
