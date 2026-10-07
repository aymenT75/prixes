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
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as z from "zod/mini";

import { ProductThumb } from "@/components/ProductThumb";
import { Icon } from "@/components/Icon";
import { ApiError, api } from "@/lib/api";
import { eur } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useA11y } from "@/lib/useA11y";
import type { SmartCartLine, SmartCartResult } from "@/lib/types";
import { spokenPrice, useVoiceTask } from "@/lib/voiceTasks";

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
    if (error.status === 402) return "L'assistant fait partie de Prixes Premium.";
    if (error.status === 429) return error.message;
    if (error.status === 422) return error.message;
    if (error.status === 504) return "L'assistant met trop de temps à répondre. Réessayez.";
    if (error.status === 503) return "L'assistant n'est pas disponible pour le moment.";
    return error.message;
  }
  return "Une erreur est survenue. Réessayez.";
}

export function SmartAssistant({ start = false }: {
  /**
   * The empty-list look: a big microphone and examples to touch, the text box
   * one tap away. An empty box that says nothing was the first thing a newcomer
   * met, and they did not know what to do with it.
   */
  start?: boolean;
} = {}) {
  const qc = useQueryClient();
  const openVoice = useA11y((s) => s.setVoiceOpen);
  const [typing, setTyping] = useState(false);
  const { user, openLogin } = useApp();
  const { allergens, diets } = useA11y();
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState(0);
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

  // Asked by voice ("une raclette pour 6"): fill the box, run it, and put the
  // groceries on the list. Through mutateAsync's promise (see list page).
  useEffect(() => {
    const task = useVoiceTask.getState().take("cart");
    if (!task) return;
    const { finish } = useVoiceTask.getState();
    setPrompt(task.prompt);
    generate
      .mutateAsync(task.prompt)
      .then(async (result) => {
        const n = result.lines.length;
        const total = result.estimated_total != null ? `, environ ${spokenPrice(result.estimated_total)}` : "";
        const head = `${result.title} pour ${result.servings} : ${n} article${n > 1 ? "s" : ""}${total}.`;
        if (!user) {
          finish(`${head} Connectez-vous pour que je les mette dans votre liste.`, "plein");
          return;
        }
        // Asked by voice, the user wants the groceries, not a draft to review:
        // they go straight on the list, no button to find and touch.
        const lines = result.lines
          .filter((l) => !l.optional)
          .map((l) => ({
            barcode: l.barcode,
            free_text: l.barcode ? null : l.product_name,
            name: l.matched_name ?? l.product_name,
            quantity: l.quantity,
            amount: l.amount,
            unit: l.unit,
          }));
        try {
          const res = await api.commitSmartCart(result.draft_id, lines);
          qc.invalidateQueries({ queryKey: ["shopping"] });
          setDraft(null);
          setAdded(`${res.added} article${res.added > 1 ? "s" : ""} ajouté${res.added > 1 ? "s" : ""}`);
          const count = res.added + res.merged;
          finish(`${head} C'est fait : ${count} article${count > 1 ? "s" : ""} dans votre liste.`, "plein");
        } catch {
          finish(`${head} Je n'ai pas pu les mettre dans votre liste. Touchez « Ajouter à ma liste ».`, "plein", false);
        }
      })
      .catch((e) => finish(messageFor(e), "roule", false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

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

  const unavailable = !!status && !status.available;
  if (unavailable && !start) return null;

  const kept = draft?.lines.filter((l) => l.keep) ?? [];
  const keptTotal = kept.reduce((sum, l) => sum + (l.best_price ?? 0) * l.quantity, 0);
  const keptUnpriced = kept.filter((l) => l.best_price == null).length;

  const startHead = start && (
    <div className="flex flex-col items-center gap-3 text-center">
      <button
        onClick={() => openVoice(true)}
        aria-label="Parler à Prixes, assistant vocal"
        className="prixes-orb grid h-20 w-20 place-items-center bg-primary-container text-on-primary-container shadow-glow active:scale-95"
      >
        <Icon name="mic" fill style={{ fontSize: 40 }} />
      </button>
      <h2 id="smart-assistant-title" className="text-headline-md text-on-surface">
        Dites ce qu&apos;il vous faut
      </h2>
      <p className="text-body-md text-on-surface-variant">
        Touchez le micro et parlez{unavailable ? "." : ", ou touchez un exemple :"}
      </p>
    </div>
  );
  const showForm = !start || typing;

  return (
    <section className="card mb-4 p-4" aria-labelledby="smart-assistant-title">
      {startHead}
      {!start && (
      <div className="flex items-center gap-2">
        <Icon name="auto_awesome" className="text-[20px] text-primary" />
        <h2 id="smart-assistant-title" className="text-label-lg text-on-surface">
          Assistant courses
        </h2>
      </div>
      )}
      {!start && (
      <p className="mt-1 text-body-md text-on-surface-variant">
        Dites ce que vous voulez préparer, je monte la liste et je compare les prix.
      </p>
      )}

      {showForm && !unavailable && (
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
      </div>
      )}

      {!draft && !generate.isPending && !unavailable && (
        <div className={`mt-2 flex flex-wrap gap-2 ${start ? "justify-center" : ""}`}>
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

      {showForm && !unavailable && (
      <button
        onClick={submit}
        disabled={generate.isPending || prompt.trim().length < 3}
        className="btn-primary mt-3 w-full py-3 disabled:opacity-50"
      >
        <Icon name="auto_awesome" className="text-[18px]" />
        {generate.isPending ? "Un instant…" : "Créer ma liste"}
      </button>
      )}

      {start && !typing && !draft && !generate.isPending && (
        <div className="mt-3 flex flex-wrap justify-center gap-x-4">
          {!unavailable && (
            <button
              onClick={() => setTyping(true)}
              className="flex min-h-11 items-center gap-1 text-label-md text-primary"
            >
              <Icon name="edit" className="text-[18px]" /> Écrire plutôt
            </button>
          )}
          <Link href="/courses" className="flex min-h-11 items-center gap-1 text-label-md text-primary">
            <Icon name="search" className="text-[18px]" /> Chercher un produit
          </Link>
        </div>
      )}

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
              {/* "0,00 €" reads as a broken screen when the truth is simply that
                  we know no price for anything kept. Say that instead. */}
              <p className="text-headline-md text-on-surface">
                {kept.length > 0 && keptUnpriced === kept.length
                  ? "Non estimable"
                  : eur(keptTotal)}
              </p>
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
              onClick={() => (user ? commit.mutate(draft) : openLogin(true))}
              disabled={commit.isPending || kept.length === 0}
              className="btn-primary flex-[2] py-3 disabled:opacity-50"
            >
              <Icon name="playlist_add" className="text-[18px]" />
              {commit.isPending
                ? "Ajout…"
                : user
                  ? `Ajouter à ma liste (${kept.length})`
                  : "Se connecter pour garder"}
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
        <ProductThumb
          barcode={line.barcode}
          imageUrl={line.image_url}
          name={line.matched_name ?? line.product_name}
          size={40}
          className="p-0.5"
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="break-words text-label-lg text-on-surface">
          {line.matched_name ?? line.product_name}
        </p>
        <p className="break-words text-micro text-on-surface-variant">
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
