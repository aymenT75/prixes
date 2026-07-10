"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { track } from "@/lib/analytics";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { hapticSuccess } from "@/lib/voice";

export default function FeedbackPage() {
  const { user } = useApp();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      api.submitFeedback({
        message: message.trim(),
        rating: rating || null,
        email: email.trim() || undefined,
        page: "/feedback",
      }),
    onSuccess: () => {
      hapticSuccess();
      track("feedback_submit", "/feedback");
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 3) return;
    submit.mutate();
  }

  if (submit.isSuccess) {
    return (
      <div>
        <PageHeader title="Votre avis" back />
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon name="favorite" fill className="text-[40px]" />
          </span>
          <h2 className="text-headline-md text-on-surface">Merci pour votre retour&nbsp;!</h2>
          <p className="max-w-xs text-body-md text-on-surface-variant">
            Votre message nous aide à améliorer Prixes. Nous le lisons attentivement.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Votre avis" back />

      <p className="mb-5 text-body-md text-on-surface-variant">
        Une idée, un bug, un mot&nbsp;? Dites-nous tout — ça nous aide à améliorer l&apos;app.
      </p>

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Rating */}
        <fieldset>
          <legend className="mb-2 text-label-lg text-on-surface-variant">
            Votre note (facultatif)
          </legend>
          <div className="flex gap-2" role="radiogroup" aria-label="Note sur 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n === rating ? 0 : n)}
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                className="rounded-lg p-1 transition-transform active:scale-90"
              >
                <Icon
                  name="star"
                  fill={n <= rating}
                  className={`text-[36px] ${n <= rating ? "text-primary" : "text-outline-variant"}`}
                />
              </button>
            ))}
          </div>
        </fieldset>

        {/* Message */}
        <div>
          <label htmlFor="fb-message" className="mb-2 block text-label-lg text-on-surface-variant">
            Votre message
          </label>
          <textarea
            id="fb-message"
            className="input min-h-32 resize-y"
            placeholder="Ce que vous aimez, ce qui manque, un problème rencontré…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={4000}
            required
          />
        </div>

        {/* Email (optional) */}
        {!user && (
          <div>
            <label htmlFor="fb-email" className="mb-2 block text-label-lg text-on-surface-variant">
              Votre e-mail (facultatif)
            </label>
            <input
              id="fb-email"
              type="email"
              className="input"
              placeholder="pour vous répondre"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
          </div>
        )}

        {submit.isError && (
          <p className="flex items-center gap-2 rounded-xl bg-error-container p-3 text-label-md text-on-error-container">
            <Icon name="error" className="text-[18px]" /> Échec de l&apos;envoi. Réessayez.
          </p>
        )}

        <button
          type="submit"
          disabled={submit.isPending || message.trim().length < 3}
          className="btn-primary w-full py-3.5 disabled:opacity-60"
        >
          <Icon name="send" className="text-[18px]" />
          {submit.isPending ? "Envoi…" : "Envoyer mon avis"}
        </button>
      </form>
    </div>
  );
}
