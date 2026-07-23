"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { useA11y } from "@/lib/useA11y";
import { useDialog } from "@/lib/useDialog";
import {
  createVoiceRecognizer,
  parseIntent,
  readPageAloud,
  speak,
  speechSupported,
  stopSpeaking,
  vibrate,
  type VoiceRecognizer,
} from "@/lib/voice";

type Phase = "idle" | "listening" | "responding" | "error";

export function VoiceAssistant() {
  const router = useRouter();
  const a11y = useA11y();
  const open = useA11y((s) => s.voiceOpen);
  const setOpen = useA11y((s) => s.setVoiceOpen);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [supported, setSupported] = useState(true);
  const [handsFree, setHandsFree] = useState(false);
  const recRef = useRef<VoiceRecognizer | null>(null);
  const handledRef = useRef(false);
  const handsFreeRef = useRef(false);
  const openRef = useRef(false);
  const startRef = useRef<() => void>(() => {});

  useEffect(() => {
    setSupported(speechSupported());
  }, []);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const close = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    stopSpeaking();
    setOpen(false);
    setPhase("idle");
  }, [setOpen]);

  // Runs a product search, retrying with a shorter phrase if nothing matches
  // ("du lait bio" -> "du lait" -> "du"), then falls back to a few popular
  // products so the user is never left with a dead end.
  const runSearch = useCallback(async (query: string) => {
    let q = query;
    let result: {
      items: { name: string | null; barcode: string; nutriscore: string | null }[];
      total: number;
    } | null = null;
    try {
      result = await api.searchProducts(q);
    } catch {
      result = null;
    }
    while (result && result.total === 0 && q.trim().includes(" ")) {
      q = q.trim().split(" ").slice(0, -1).join(" ");
      try {
        result = await api.searchProducts(q);
      } catch {
        result = null;
      }
    }

    if (result && result.total > 0 && result.items[0]) {
      const top = result.items[0];
      const name = top.name ?? q;
      const grade = (top.nutriscore ?? "").toLowerCase();

      const detail = `/courses/detail?barcode=${encodeURIComponent(top.barcode)}`;
      const found = `Nous avons trouvé le meilleur prix et le magasin le plus proche pour ${name}.`;

      // Poor Nutri-Score (D/E): stay on the product the user asked for, but flag that a
      // healthier option exists. /alternatives returns same-category products with a
      // strictly better score; category matching is uneven, so check the first few D/E
      // hits and mention the least-processed one (NOVA ascending). We do NOT redirect —
      // the user's own result stays on screen.
      if (grade === "d" || grade === "e") {
        for (const item of result.items.slice(0, 3)) {
          const g = (item.nutriscore ?? "").toLowerCase();
          if (g !== "d" && g !== "e") continue;
          try {
            const alts = await api.getAlternatives(item.barcode);
            const candidates = alts.items.filter((a) => a.name && a.barcode);
            const healthier = [...candidates].sort(
              (a, b) => (a.nova_group ?? 99) - (b.nova_group ?? 99),
            )[0];
            if (healthier?.name) {
              return {
                say: `${found} À noter, son Nutri-Score est faible : ${grade.toUpperCase()}. Une alternative plus saine existe, ${healthier.name}.`,
                path: detail,
              };
            }
          } catch {
            /* try the next candidate */
          }
        }
        // No healthier product found — still flag the score, stay on the product.
        return {
          say: `${found} À noter, son Nutri-Score est faible : ${grade.toUpperCase()}.`,
          path: detail,
        };
      }

      // Healthy enough: best price + nearest store, nothing to flag.
      return { say: found, path: detail };
    }

    // Nothing matched, even after shortening. Say so plainly and offer a real
    // alternative the user lands on — not an empty search page. Take one popular
    // product and route to *its* results, so when the assistant closes there is
    // something to look at instead of a dead end.
    try {
      const popular = await api.browseProducts(3);
      const alt = popular.items.map((p) => p.name).find((n): n is string => !!n);
      if (alt) {
        return {
          say: `Je n'ai pas trouvé ${query}. Voici une alternative : ${alt}.`,
          path: `/courses?q=${encodeURIComponent(alt)}`,
        };
      }
    } catch {
      /* ignore — fall through to the plain not-found line */
    }
    return {
      say: `Je n'ai pas trouvé ${query}.`,
      path: `/courses?q=${encodeURIComponent(query)}`,
    };
  }, []);

  const act = useCallback(
    (text: string) => {
      const intent = parseIntent(text);

      if (intent.type === "search") {
        setResponse("");
        setPhase("responding");
        vibrate(30);
        void runSearch(intent.query).then(({ say, path }) => {
          setResponse(say);
          // Dismiss the assistant NOW — not when the spoken answer finishes. The
          // destination product page auto-reads (when that setting is on) and
          // interrupts our line via TextToSpeech.stop(), so the speak() completion
          // callback could never fire and the menu stayed open. Stop listening, hide
          // the overlay, then navigate and announce independently.
          try {
            recRef.current?.stop();
          } catch {
            /* ignore */
          }
          setOpen(false);
          setPhase("idle");
          router.push(path);
          speak(say);
        });
        return;
      }

      let say = intent.say;
      switch (intent.type) {
        case "navigate":
          router.push(intent.path);
          break;
        case "setting":
          if (intent.action === "dark") a11y.setDark(true);
          else if (intent.action === "light") a11y.setDark(false);
          else if (intent.action === "bigger") a11y.biggerText();
          else if (intent.action === "smaller") a11y.smallerText();
          else if (intent.action === "contrast") a11y.toggleContrast();
          break;
        case "read": {
          const content = readPageAloud();
          say = content || "Il n'y a rien à lire sur cette page.";
          break;
        }
        case "help":
        case "unknown":
          break;
      }
      setResponse(say);
      setPhase("responding");
      vibrate(30);
      speak(say, () => {
        setPhase("idle");
        // Hands-free: keep the conversation going.
        if (handsFreeRef.current && openRef.current) setTimeout(() => startRef.current(), 500);
      });
    },
    [router, a11y, runSearch, close],
  );

  const startListening = useCallback(() => {
    if (!speechSupported()) {
      setSupported(false);
      return;
    }
    stopSpeaking();
    handledRef.current = false;
    setTranscript("");
    setResponse("");
    const rec = createVoiceRecognizer();
    if (!rec) {
      setSupported(false);
      return;
    }
    recRef.current = rec;
    rec.onPartial = (txt) => setTranscript(txt);
    rec.onFinal = (txt) => {
      setTranscript(txt);
      if (!handledRef.current) {
        handledRef.current = true;
        act(txt);
      }
    };
    rec.onError = (kind) => {
      setPhase("error");
      setResponse(
        kind === "not-allowed"
          ? "Je n'ai pas accès au micro. Autorisez le microphone dans les réglages."
          : "Je n'ai pas pu écouter. Réessayez.",
      );
    };
    rec.onEnd = () => {
      setPhase((p) => (p === "listening" ? "idle" : p));
    };
    rec.start();
    setPhase("listening");
    vibrate(30);
  }, [act]);

  useEffect(() => {
    startRef.current = startListening;
  }, [startListening]);

  // When the assistant is opened (from the accessibility sheet), greet + listen.
  const greetedRef = useRef(false);
  useEffect(() => {
    if (open && !greetedRef.current) {
      greetedRef.current = true;
      speak("Je vous écoute.");
      setTimeout(startListening, 350);
    } else if (!open) {
      greetedRef.current = false;
    }
  }, [open, startListening]);

  const dialogRef = useDialog(open, close);

  // Launcher lives in the top header (PageHeader); this only renders the overlay.
  return (
    <>
      {open && (
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Assistant vocal Prixes"
          className="fixed inset-0 z-[70] flex flex-col items-center justify-end bg-black/50 backdrop-blur-sm outline-none"
          onClick={close}
        >
          <div
            // See AccessibilityFab: `zoom` enlarges this sheet after its 90vh cap is
            // computed, so at max text size it can exceed the real viewport and push
            // the close button off-screen. Dividing by --zoom-scale prevents that.
            className="max-h-[calc(90vh/var(--zoom-scale,1))] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-surface-container-lowest p-6 pb-10 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-4 flex items-center justify-between bg-surface-container-lowest px-6 pb-3 pt-6">
              <h2 className="text-headline-md text-on-surface">Assistant vocal</h2>
              <button
                onClick={close}
                aria-label="Fermer l'assistant"
                className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high"
              >
                <Icon name="close" />
              </button>
            </div>

            {!supported ? (
              <p className="rounded-xl bg-warning-soft p-4 text-body-md text-on-surface">
                {"La reconnaissance vocale n'est pas disponible sur ce navigateur. Essayez Chrome ou Safari. Vous pouvez aussi tout faire au toucher."}
              </p>
            ) : (
              <>
                {/* Animated mic */}
                <div className="flex flex-col items-center gap-3 py-2">
                  <button
                    onClick={startListening}
                    aria-label="Parler"
                    className={`relative flex h-24 w-24 items-center justify-center rounded-full text-on-primary transition-all ${
                      phase === "listening" ? "bg-deal-accent" : "bg-primary"
                    }`}
                  >
                    {phase === "listening" && (
                      <span className="absolute inset-0 animate-ping rounded-full bg-deal-accent/40" />
                    )}
                    <Icon name={phase === "listening" ? "graphic_eq" : "mic"} fill className="text-[44px]" />
                  </button>
                  <p className="text-label-lg text-on-surface-variant" aria-live="polite">
                    {phase === "listening"
                      ? "Je vous écoute…"
                      : phase === "responding"
                        ? "…"
                        : "Appuyez et parlez"}
                  </p>
                </div>

                {/* Live transcript + response (also visible for deaf/HoH users) */}
                <div className="mt-3 min-h-[44px] space-y-2" aria-live="polite">
                  {transcript && (
                    <p className="rounded-xl bg-surface-container px-4 py-3 text-body-lg text-on-surface">
                      « {transcript} »
                    </p>
                  )}
                  {response && (
                    <p className="rounded-xl bg-primary/10 px-4 py-3 text-body-lg text-primary">
                      {response}
                    </p>
                  )}
                </div>

                {/* Hands-free toggle */}
                <button
                  onClick={() => setHandsFree((v) => !v)}
                  role="switch"
                  aria-checked={handsFree}
                  className="mt-4 flex w-full items-center justify-between rounded-xl border border-outline-variant/30 p-3 text-left"
                >
                  <span className="flex items-center gap-2 text-label-lg text-on-surface">
                    <Icon name="hearing" className="text-primary" /> Écoute mains-libres
                  </span>
                  <span
                    className={`relative h-7 w-12 rounded-full transition-colors ${handsFree ? "bg-primary" : "bg-surface-variant"}`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${handsFree ? "left-6" : "left-1"}`}
                    />
                  </span>
                </button>

                {/* Example commands */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {["Cherche du lait", "Les bons plans", "Agrandis le texte"].map(
                    (ex) => (
                      <button
                        key={ex}
                        onClick={() => act(ex)}
                        className="chip chip-idle text-label-md"
                      >
                        {ex}
                      </button>
                    ),
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
