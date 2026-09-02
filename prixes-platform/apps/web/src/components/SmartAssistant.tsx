"use client";

/**
 * Smart Assistant — a sentence becomes a costed basket.
 *
 * Two deliberate choices here.
 *
 * The waiting state names the three phases the server actually goes through
 * rather than spinning: the user is watching a request that legitimately takes
 * several seconds, and "je compare les prix" tells them why.
 *
 * Nothing is written until they press the button. The proposal is editable —
 * quantities, deletions — because a generated basket is a draft, not a verdict,
 * and an item we could not price says so instead of quietly counting as €0.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import * as z from "zod/mini";

import { Icon } from "@/components/Icon";
import { ApiError, api } from "@/lib/api";
import { eur } from "@/lib/format";
import { useA11y } from "@/lib/useA11y";
import { createVoiceRecognizer, speechSupported } from "@/lib/voice";
import type { SmartCartLine, SmartCartResult } from "@/lib/types";

// The client gives up slightly after the server's own 25s deadline, so a server
// timeout surfaces as its own message rather than as a generic abort.
const CLIENT_DEADLINE_MS = 27_000;

const EXAMPLES = [
  "Une raclette pour 6",
  "Un couscous pour 8",
  "Les petits-déjeuners de la semaine",
];

const PHASES = [
  "Je comprends votre demande…",
  "Je cherche les produits…",
  "Je compare les prix…",
];

/**
 * The server is typed, but it is still a separate deployment: a schema drift
 * would otherwise surface as a blank screen inside the render. Parsing here
 * turns that into an error message.
 *
 * Money and quantities are `Decimal` on the server, and Pydantic serialises a
 * Decimal as a JSON *string* ("5.49"), not a number — so every price-bearing
 * field is coerced. Declaring them `z.number()` rejected every real response and
 * left the assistant permanently showing "une erreur est survenue".
 */
const lineSchema = z.object({
  product_name: z.string(),
  amount: z.coerce.number(),
  unit: z.string(),
  category: z.string(),
  optional: z.boolean(),
  barcode: z.nullable(z.string()),
  matched_name: z.nullable(z.string()),
  image_url: z.nullable(z.string()),
  best_price: z.nullable(z.coerce.number()),
  unit_price: z.nullable(z.string()),
  quantity: z.number(),
  allergen_warning: z.nullable(z.string()),
});

const resultSchema = z.object({
  draft_id: z.string(),
  title: z.string(),
  servings: z.number(),
  lines: z.array(lineSchema),
  estimated_total: z.nullable(z.coerce.number()),
  matched_count: z.number(),
  unpriced_count: z.number(),
  cached: z.boolean(),
});

/** A line the user can still edit before it is written to the list. */
type DraftLine = SmartCartLine & { keep: boolean };
// Omit, not an intersection: intersecting `lines` would keep both element types
// and TypeScript then refuses every assignment to it.
type Draft = Omit<SmartCartResult, "lines"> & { lines: DraftLine[] };

function messageFor(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "L'assistant met trop de temps à répondre. Réessayez.";
  }
  if (error instanceof ApiError) {
    if (error.status === 429) return error.message;
    if (error.status === 422) return error.message;
    if (error.status === 504) return "L'assistant met trop de temps à répondre. Réessayez.";
    if (error.status === 503) return "L'assistant n'est pas disponible pour le moment.";
    return error.message;
  }
  return "Une erreur est survenue. Réessayez.";
}

export function SmartAssistant() {
  const qc = useQueryClient();
  const { allergens, diets } = useA11y();
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState(0);
  const [listening, setListening] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Hide the whole block when no model key is configured, rather than offering a
  // button that can only fail.
  const { data: status } = useQuery({
    queryKey: ["smart-cart-status"],
    queryFn: () => api.smartCartStatus(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const generate = useMutation({
    mutationFn: async (text: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const timer = setTimeout(() => controller.abort(), CLIENT_DEADLINE_MS);
      try {
        const raw = await api.smartCart(
          { prompt: text, avoid_allergens: allergens, diets },
          controller.signal,
        );
        const parsed = resultSchema.safeParse(raw);
        if (!parsed.success) throw new Error("schema");
        return parsed.data as SmartCartResult;
      } finally {
        clearTimeout(timer);
        abortRef.current = null;
      }
    },
    onMutate: () => {
      setError(null);
      setAdded(null);
      setDraft(null);
      setPhase(0);
    },
    onSuccess: (result) =>
      setDraft({ ...result, lines: result.lines.map((l) => ({ ...l, keep: !l.optional })) }),
    onError: (e) => setError(messageFor(e)),
  });

  const commit = useMutation({
    mutationFn: async (current: Draft) => {
      const lines = current.lines
        .filter((l) => l.keep)
        .map((l) => ({
          barcode: l.barcode,
          free_text: l.barcode ? null : l.product_name,
          name: l.matched_name ?? l.product_name,
          quantity: l.quantity,
          amount: l.amount,
          unit: l.unit,
        }));
      return api.commitSmartCart(current.draft_id, lines);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["shopping"] });
      setDraft(null);
      setPrompt("");
      const parts = [];
      if (res.added) parts.push(`${res.added} article${res.added > 1 ? "s" : ""} ajouté${res.added > 1 ? "s" : ""}`);
      if (res.merged) parts.push(`${res.merged} regroupé${res.merged > 1 ? "s" : ""}`);
      setAdded(parts.join(", ") || "Liste à jour");
    },
    onError: (e) => setError(messageFor(e)),
  });

  // Advance the phase text while the request is in flight. Purely cosmetic, but
  // the timings match the server's real stages closely enough to be honest.
  useEffect(() => {
    if (!generate.isPending) return;
    const timers = [
      setTimeout(() => setPhase(1), 1800),
      setTimeout(() => setPhase(2), 6000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [generate.isPending]);

  const dictate = () => {
    const recognizer = createVoiceRecognizer();
    if (!recognizer) return;
    setListening(true);
    recognizer.onPartial = (text) => setPrompt(text);
    recognizer.onFinal = (text) => {
      setPrompt(text);
      setListening(false);
      recognizer.stop();
      if (text.trim().length >= 3) generate.mutate(text.trim());
    };
    recognizer.onError = (kind) => {
      setListening(false);
      setError(
        kind === "not-allowed"
          ? "Micro refusé. Autorisez le micro pour dicter votre demande."
          : "La dictée n'a pas fonctionné. Tapez votre demande.",
      );
    };
    recognizer.onEnd = () => setListening(false);
    recognizer.start();
  };

  const submit = () => {
    const text = prompt.trim();
    if (text.length < 3) {
      setError("Décrivez ce que vous voulez préparer, en quelques mots.");
      return;
    }
    generate.mutate(text);
  };

  const setLine = (index: number, patch: Partial<DraftLine>) =>
    setDraft((d) =>
      d ? { ...d, lines: d.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)) } : d,
    );

  if (status && !status.available) return null;

  const kept = draft?.lines.filter((l) => l.keep) ?? [];
  const keptTotal = kept.reduce((sum, l) => sum + (l.best_price ?? 0) * l.quantity, 0);
  const keptUnpriced = kept.filter((l) => l.best_price == null).length;

  return (
    <section className="card mb-4 p-4" aria-labelledby="smart-assistant-title">
      <div className="flex items-center gap-2">
        <Icon name="auto_awesome" className="text-[20px] text-primary" />
        <h2 id="smart-assistant-title" className="text-label-lg text-on-surface">
          Assistant courses
        </h2>
      </div>
      <p className="mt-1 text-body-md text-on-surface-variant">
        Dites ce que vous voulez préparer, je monte la liste et je compare les prix.
      </p>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={400}
          disabled={generate.isPending}
          placeholder="Ingrédients pour une raclette pour 6"
          aria-label="Décrivez ce que vous voulez préparer"
          className="min-h-[52px] flex-1 resize-none rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none disabled:opacity-60"
        />
        {speechSupported() && (
          <button
            onClick={listening ? () => setListening(false) : dictate}
            disabled={generate.isPending}
            aria-label={listening ? "Arrêter la dictée" : "Dicter votre demande"}
            className={`grid h-[52px] w-[52px] flex-shrink-0 place-items-center rounded-xl ${
              listening ? "bg-error text-on-error" : "bg-surface-container text-on-surface"
            } active:scale-95 disabled:opacity-60`}
          >
            <Icon name={listening ? "stop" : "mic"} className="text-[22px]" />
          </button>
        )}
      </div>

      {!draft && !generate.isPending && (
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => {
                setPrompt(example);
                generate.mutate(example);
              }}
              className="chip whitespace-normal bg-surface-container-high text-left text-label-md text-on-surface-variant hover:bg-surface-container"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={submit}
        disabled={generate.isPending || prompt.trim().length < 3}
        className="btn-primary mt-3 w-full py-3 disabled:opacity-50"
      >
        <Icon name="auto_awesome" className="text-[18px]" />
        {generate.isPending ? "Un instant…" : "Créer ma liste"}
      </button>

      {generate.isPending && (
        <p role="status" aria-live="polite" className="mt-3 text-center text-body-md text-on-surface-variant">
          <span className="mr-2 inline-block animate-pulse">●</span>
          {PHASES[phase]}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-error-container p-3 text-body-md text-on-error-container">
          {error}
        </p>
      )}

      {added && (
        <p role="status" className="mt-3 rounded-xl bg-primary-container p-3 text-body-md text-on-primary-container">
          {added}.
        </p>
      )}

      {draft && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-headline-md text-on-surface">{draft.title}</h3>
            <span className="text-micro text-on-surface-variant">
              {draft.servings} personne{draft.servings > 1 ? "s" : ""}
            </span>
          </div>

          <ul className="mt-2 space-y-1">
            {draft.lines.map((line, index) => (
              <DraftRow
                key={`${line.product_name}-${index}`}
                line={line}
                onToggle={() => setLine(index, { keep: !line.keep })}
                onQuantity={(quantity) => setLine(index, { quantity })}
              />
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-container p-3">
            <div>
              <p className="text-micro uppercase tracking-wider text-on-surface-variant">
                Estimation
              </p>
              <p className="text-headline-md text-on-surface">{eur(keptTotal)}</p>
            </div>
            {keptUnpriced > 0 && (
              <p className="max-w-[55%] text-right text-micro text-on-surface-variant">
                {keptUnpriced} article{keptUnpriced > 1 ? "s" : ""} sans prix connu, non compté
                {keptUnpriced > 1 ? "s" : ""}
              </p>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button onClick={() => setDraft(null)} className="btn-outline flex-1 py-3">
              Annuler
            </button>
            <button
              onClick={() => commit.mutate(draft)}
              disabled={commit.isPending || kept.length === 0}
              className="btn-primary flex-[2] py-3 disabled:opacity-50"
            >
              <Icon name="playlist_add" className="text-[18px]" />
              {commit.isPending ? "Ajout…" : `Ajouter à ma liste (${kept.length})`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function DraftRow({
  line,
  onToggle,
  onQuantity,
}: {
  line: DraftLine;
  onToggle: () => void;
  onQuantity: (quantity: number) => void;
}) {
  // Trailing zeros read badly on a shopping list: 1.500 kg → 1,5 kg.
  const amount = String(line.amount).replace(/\.0+$/, "").replace(".", ",");

  return (
    <li
      className={`flex items-center gap-3 rounded-xl border border-outline-variant p-2 ${
        line.keep ? "" : "opacity-45"
      }`}
    >
      <button
        onClick={onToggle}
        aria-label={line.keep ? `Retirer ${line.product_name}` : `Garder ${line.product_name}`}
        aria-pressed={line.keep}
        className="flex-shrink-0"
      >
        <Icon
          name={line.keep ? "check_circle" : "radio_button_unchecked"}
          fill={line.keep}
          className={`text-[24px] ${line.keep ? "text-primary" : "text-outline-variant"}`}
        />
      </button>

      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-white">
        {line.image_url ? (
          <Image src={line.image_url} alt="" fill className="object-contain p-0.5" sizes="40px" />
        ) : (
          <div className="grid h-full place-items-center text-outline-variant">
            <Icon name="grocery" className="text-[18px]" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-label-lg text-on-surface">
          {line.matched_name ?? line.product_name}
        </p>
        <p className="truncate text-micro text-on-surface-variant">
          {amount} {line.unit}
          {/* Just the price. The metadata line is set in the mono face and shares
              its row with the quantity stepper, so any suffix ("l'unité", "/ u.")
              pushed every row into an ellipsis — and the price is unambiguous
              here anyway, sitting right beside the pack count. */}
          {line.best_price != null ? ` · ${eur(line.best_price)}` : " · prix inconnu"}
          {line.optional ? " · facultatif" : ""}
        </p>
        {line.allergen_warning && (
          <p className="mt-0.5 text-micro text-error">
            <Icon name="warning" className="mr-1 align-[-3px] text-[13px]" />
            Contient : {line.allergen_warning}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <button
          onClick={() => onQuantity(Math.max(1, line.quantity - 1))}
          aria-label={`Moins de ${line.product_name}`}
          className="grid h-7 w-7 place-items-center rounded-full bg-surface-container text-on-surface active:scale-90"
        >
          <Icon name="remove" className="text-[16px]" />
        </button>
        <span className="w-5 text-center text-label-lg text-on-surface">{line.quantity}</span>
        <button
          onClick={() => onQuantity(Math.min(99, line.quantity + 1))}
          aria-label={`Plus de ${line.product_name}`}
          className="grid h-7 w-7 place-items-center rounded-full bg-surface-container text-on-surface active:scale-90"
        >
          <Icon name="add" className="text-[16px]" />
        </button>
      </div>
    </li>
  );
}
