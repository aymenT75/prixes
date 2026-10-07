"use client";

/**
 * "Partager ma liste": invite family to the list, see who is on it, join
 * someone else's with a code, leave or stop sharing.
 *
 * The code is six characters shown in two groups of three, so it can be read
 * out over the phone to someone who is not at ease with links.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { ApiError, api } from "@/lib/api";
import { shareOrCopy } from "@/lib/share";
import type { ShareState } from "@/lib/types";
import { useDialog } from "@/lib/useDialog";

export const SHARE_KEY = ["shopping-share"] as const;

export function inviteLink(code: string): string {
  return `https://prixes.app/list?rejoindre=${code}`;
}

function spaced(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

function message(e: unknown): string {
  // The server's own French sentence ("Ce code ne correspond à aucune liste."),
  // when it sent one rather than a bare status text.
  if (e instanceof ApiError && e.status < 500 && /\s/.test(e.message)) return e.message;
  return "Cela n'a pas marché. Vérifiez votre connexion et réessayez.";
}

export function ShareListSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const ref = useDialog(true, onClose);
  const [joinCode, setJoinCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: share } = useQuery({ queryKey: SHARE_KEY, queryFn: () => api.getShare() });

  const settle = (s: ShareState) => {
    qc.setQueryData(SHARE_KEY, s);
    qc.invalidateQueries({ queryKey: ["shopping"] });
    setError(null);
  };
  const create = useMutation({ mutationFn: () => api.createShareCode(), onSuccess: settle, onError: (e) => setError(message(e)) });
  const join = useMutation({
    mutationFn: (code: string) => api.joinShare(code),
    onSuccess: (s) => {
      settle(s);
      setNote(`Vous utilisez maintenant la liste de ${s.owner_name ?? "votre proche"}.`);
      setJoinCode("");
    },
    onError: (e) => setError(message(e)),
  });
  const leave = useMutation({ mutationFn: () => api.leaveShare(), onSuccess: settle, onError: (e) => setError(message(e)) });
  const remove = useMutation({
    mutationFn: (id: string) => api.removeShareMember(id),
    onSuccess: settle,
    onError: (e) => setError(message(e)),
  });

  async function invite(code: string) {
    const result = await shareOrCopy({
      title: "Ma liste de courses Prixes",
      text: `Rejoignez ma liste de courses sur Prixes. Code : ${spaced(code)}`,
      url: inviteLink(code),
    });
    setNote(result === "copied" ? "Invitation copiée : collez-la dans un message." : null);
  }

  const others = share?.members.filter((m) => !m.you) ?? [];
  const shared = (share?.members.length ?? 0) > 1;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-title"
      className="fixed inset-0 z-[60] grid place-items-end bg-black/40 backdrop-blur-sm outline-none sm:place-items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-xl bg-surface-container-lowest p-6 shadow-float sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="share-title" className="text-headline-md text-on-surface">
            {share && !share.is_owner ? "Liste partagée" : "Partager ma liste"}
          </h2>
          <button onClick={onClose} aria-label="Fermer" className="grid h-11 w-11 place-items-center text-on-surface-variant">
            <Icon name="close" />
          </button>
        </div>

        {!share && (
          <p className="py-6 text-center text-body-md text-on-surface-variant" role="status">
            Chargement…
          </p>
        )}

        {share?.is_owner && (
          <>
            <p className="mt-1 text-body-md text-on-surface-variant">
              Les personnes invitées voient la liste, ajoutent des produits et cochent ce qui est
              acheté. Tout se met à jour chez chacun.
            </p>
            {share.code ? (
              <>
                <button onClick={() => invite(share.code!)} className="btn-primary mt-4 w-full py-3">
                  <Icon name="send" className="text-[20px]" /> Envoyer une invitation
                </button>
                <p className="mt-3 text-center text-body-md text-on-surface-variant">
                  par SMS, WhatsApp ou e-mail, ou donnez ce code :
                </p>
                <p
                  className="mt-2 select-all rounded-xl border-2 border-dashed border-outline-variant py-3 text-center font-display text-[28px] font-extrabold tracking-[0.18em] text-on-surface"
                  aria-label={`Code ${share.code.split("").join(" ")}`}
                >
                  {spaced(share.code)}
                </p>
              </>
            ) : (
              <button
                onClick={() => create.mutate()}
                disabled={create.isPending}
                className="btn-primary mt-4 w-full py-3"
              >
                <Icon name="send" className="text-[20px]" />
                {create.isPending ? "Un instant…" : "Inviter quelqu'un"}
              </button>
            )}
          </>
        )}

        {share && !share.is_owner && (
          <p className="mt-1 text-body-md text-on-surface-variant">
            Vous utilisez la liste de <strong className="text-on-surface">{share.owner_name}</strong>.
            Votre propre liste est mise de côté et revient si vous quittez celle-ci.
          </p>
        )}

        {share && shared && (
          <ul className="mt-4 divide-y divide-outline-variant/40" aria-label="Personnes sur la liste">
            {share.members.map((m) => (
              <li key={m.id} className="flex min-h-12 items-center gap-3 py-2">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-primary text-label-md text-on-primary">
                  {m.initials}
                </span>
                <span className="min-w-0 flex-1 break-words text-body-md text-on-surface">
                  {m.you ? "Vous" : m.name}
                </span>
                <span className="text-micro text-on-surface-variant">
                  {m.role === "owner" ? "Propriétaire" : "Peut modifier"}
                </span>
                {share.is_owner && !m.you && (
                  <button
                    onClick={() => remove.mutate(m.id)}
                    aria-label={`Retirer ${m.name} de la liste`}
                    className="grid h-11 w-11 place-items-center text-on-surface-variant"
                  >
                    <Icon name="close" className="text-[20px]" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {note && (
          <p className="mt-3 rounded-xl bg-primary-container p-3 text-body-md text-on-primary-container" role="status">
            {note}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-xl bg-error-container p-3 text-body-md text-on-error-container" role="alert">
            {error}
          </p>
        )}

        {share && (share.is_owner ? shared || share.code : true) && (
          <button
            onClick={() => leave.mutate()}
            disabled={leave.isPending}
            className="mt-4 flex min-h-11 w-full items-center justify-center text-label-lg text-error"
          >
            {share.is_owner ? "Arrêter le partage" : "Quitter cette liste"}
          </button>
        )}

        {/* Joining someone else's list, by the code they read out. */}
        {share?.is_owner && others.length === 0 && (
          <form
            className="mt-5 border-t border-outline-variant/40 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (joinCode.trim()) join.mutate(joinCode);
            }}
          >
            <label htmlFor="join-code" className="text-label-lg text-on-surface">
              Un proche vous a donné un code ?
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC 123"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={8}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-body-md tracking-widest text-on-surface"
              />
              <button type="submit" disabled={join.isPending || joinCode.trim().length < 4} className="btn-primary px-4">
                Rejoindre
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** "Aymen vous invite à sa liste" — opened from an invitation link. */
export function JoinInvite({ code, onDone }: { code: string; onDone: () => void }) {
  const qc = useQueryClient();
  const ref = useDialog(true, onDone);
  const [error, setError] = useState<string | null>(null);
  const { data, isError } = useQuery({
    queryKey: ["share-preview", code],
    queryFn: () => api.previewShare(code),
    retry: false,
  });
  const join = useMutation({
    mutationFn: () => api.joinShare(code),
    onSuccess: (s) => {
      qc.setQueryData(SHARE_KEY, s);
      qc.invalidateQueries({ queryKey: ["shopping"] });
      onDone();
    },
    onError: (e) => setError(message(e)),
  });

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-title"
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm outline-none"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-surface-container-lowest shadow-float">
        <div className="bg-primary-container/25 p-6 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary text-on-primary">
          <Icon name="list_alt" className="text-[30px]" />
        </span>
        <h2 id="join-title" className="mt-3 text-headline-md text-on-surface">
          {isError
            ? "Cette invitation ne marche plus"
            : data
              ? `${data.owner_name} vous invite à sa liste de courses`
              : "Invitation à une liste de courses"}
        </h2>
        <p className="mt-2 text-body-md text-on-surface-variant">
          {isError
            ? "Demandez un nouveau code à la personne qui vous a invité."
            : "Vous pourrez ajouter des produits et voir ce qui est acheté. Vos autres données restent privées."}
        </p>
        {error && (
          <p className="mt-3 rounded-xl bg-error-container p-3 text-body-md text-on-error-container" role="alert">
            {error}
          </p>
        )}
        {!isError && (
          <button onClick={() => join.mutate()} disabled={!data || join.isPending} className="btn-primary mt-4 w-full py-3">
            {join.isPending ? "Un instant…" : "Rejoindre la liste"}
          </button>
        )}
        <button onClick={onDone} className="mt-2 flex min-h-11 w-full items-center justify-center text-label-lg text-primary">
          Plus tard
        </button>
        </div>
      </div>
    </div>
  );
}
