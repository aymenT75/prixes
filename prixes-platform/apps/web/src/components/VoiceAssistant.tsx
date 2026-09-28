"use client";

/**
 * L'assistant vocal — the brain of the app.
 *
 * Every microphone ends up here. A sentence becomes an intent (lib/voice); the
 * assistant either does it itself (add to the list, read the list, create an
 * alert, change a setting) or queues a task for the page that owns it (fuel,
 * nearby stores, best store, menu, dish → list, scanner) and navigates there.
 * Meanwhile the Caddie shows the job being done, a short sound plays, and when
 * the page reports back the answer is shown and said aloud — so the result is
 * never only on screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/Icon";
import { MascotScene, type SceneState } from "@/components/MascotScene";
import { ApiError, api } from "@/lib/api";
import { earcon, type Earcon } from "@/lib/earcons";
import { useApp } from "@/lib/store";
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
import { useVoicePhrase, useVoiceTask, workingPose, type Pose, type VoiceTask } from "@/lib/voiceTasks";

type Phase = "idle" | "listening" | "working" | "done" | "error";

/** Shown under the mic and tappable: the same sentences work spoken or touched. */
const EXAMPLES = [
  "Une raclette pour 6",
  "Essence la moins chère",
  "Où faire mes courses ?",
  "Compose mon menu",
  "Magasins proches",
  "Lis ma liste",
];

const TASK_SOUND: Record<VoiceTask["kind"], Earcon> = {
  fuel: "fuel",
  stores: "radar",
  split: "drop",
  cart: "drop",
  "menu-compose": "plate",
  "menu-swap": "plate",
  scan: "scan",
};

/** A page that never reports back (location refused, network down) must not leave the Caddie rolling forever. */
const TASK_TIMEOUT_MS = 45_000;

export function VoiceAssistant() {
  const router = useRouter();
  const a11y = useA11y();
  const { user, openLogin, openPremium } = useApp();
  const open = useA11y((s) => s.voiceOpen);
  const setOpen = useA11y((s) => s.setVoiceOpen);
  const queueTask = useVoiceTask((s) => s.queue);
  const result = useVoiceTask((s) => s.result);
  const clearResult = useVoiceTask((s) => s.clearResult);

  const [phase, setPhase] = useState<Phase>("idle");
  const [pose, setPose] = useState<Pose>("ecoute");
  const [badge, setBadge] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [supported, setSupported] = useState(true);
  const [handsFree, setHandsFree] = useState(false);
  const recRef = useRef<VoiceRecognizer | null>(null);
  const handledRef = useRef(false);
  const handsFreeRef = useRef(false);
  const openRef = useRef(false);
  const startRef = useRef<() => void>(() => {});
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSupported(speechSupported());
  }, []);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const close = useCallback(() => {
    stopListening();
    stopSpeaking();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(false);
    setPhase("idle");
    setBadge(null);
  }, [setOpen, stopListening]);

  /** Show, say and sound an answer; then listen again in hands-free mode. */
  const answer = useCallback(
    (say: string, next: { pose: Pose; ok: boolean; badge?: string | null }) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setPose(next.pose);
      setBadge(next.badge ?? null);
      setPhase(next.ok ? "done" : "error");
      setResponse(say);
      earcon(next.ok ? "success" : "error");
      vibrate(next.ok ? 40 : [60, 60, 60]);
      speak(say, () => {
        if (handsFreeRef.current && openRef.current) setTimeout(() => startRef.current(), 500);
      });
    },
    [],
  );

  // A page finished the task it was given: show and say its answer.
  useEffect(() => {
    if (!result) return;
    clearResult();
    // The assistant may have been closed meanwhile; the answer is still said.
    if (!openRef.current) {
      speak(result.say);
      return;
    }
    answer(result.say, { pose: result.pose, ok: result.ok });
  }, [result, clearResult, answer]);

  // Runs a product search, retrying with a shorter phrase if nothing matches
  // ("du lait bio" -> "du lait" -> "du"), then falls back to a few popular
  // products so the user is never left with a dead end.
  const runSearch = useCallback(async (query: string) => {
    let q = query;
    let found: { items: { name: string | null; barcode: string; nutriscore: string | null }[]; total: number } | null =
      null;
    try {
      found = await api.searchProducts(q);
    } catch {
      found = null;
    }
    while (found && found.total === 0 && q.trim().includes(" ")) {
      q = q.trim().split(" ").slice(0, -1).join(" ");
      try {
        found = await api.searchProducts(q);
      } catch {
        found = null;
      }
    }

    if (found && found.total > 0 && found.items[0]) {
      const top = found.items[0];
      const name = top.name ?? q;
      const grade = (top.nutriscore ?? "").toLowerCase();
      const detail = `/courses/detail?barcode=${encodeURIComponent(top.barcode)}`;
      const said = `Nous avons trouvé le meilleur prix et le magasin le plus proche pour ${name}.`;

      // Poor Nutri-Score (D/E): stay on the product the user asked for, but flag
      // that a healthier option exists. We do NOT redirect.
      if (grade === "d" || grade === "e") {
        for (const item of found.items.slice(0, 3)) {
          const g = (item.nutriscore ?? "").toLowerCase();
          if (g !== "d" && g !== "e") continue;
          try {
            const alts = await api.getAlternatives(item.barcode);
            const healthier = [...alts.items.filter((a) => a.name && a.barcode)].sort(
              (a, b) => (a.nova_group ?? 99) - (b.nova_group ?? 99),
            )[0];
            if (healthier?.name) {
              return {
                say: `${said} À noter, son Nutri-Score est faible : ${grade.toUpperCase()}. Une alternative plus saine existe, ${healthier.name}.`,
                path: detail,
              };
            }
          } catch {
            /* try the next candidate */
          }
        }
        return { say: `${said} À noter, son Nutri-Score est faible : ${grade.toUpperCase()}.`, path: detail };
      }
      return { say: said, path: detail };
    }

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
    return { say: `Je n'ai pas trouvé ${query}.`, path: `/courses?q=${encodeURIComponent(query)}` };
  }, []);

  /** The first catalogue product a spoken name designates, or null. */
  const productFor = useCallback(async (query: string) => {
    try {
      const found = await api.searchProducts(query);
      return found.items[0] ?? null;
    } catch {
      return null;
    }
  }, []);

  const needAccount = useCallback(() => {
    answer("Il faut d'abord vous connecter. J'ouvre la connexion.", { pose: "ecoute", ok: false });
    setTimeout(() => {
      close();
      openLogin(true);
    }, 2500);
  }, [answer, close, openLogin]);

  const act = useCallback(
    (text: string) => {
      const intent = parseIntent(text);
      stopListening();
      setResponse("");
      setBadge(null);

      switch (intent.type) {
        case "search": {
          setPose("roule");
          setPhase("working");
          earcon("drop");
          vibrate(30);
          void runSearch(intent.query).then(({ say, path }) => {
            // Dismiss now: the product page may auto-read and would cut our line.
            setOpen(false);
            setPhase("idle");
            router.push(path);
            speak(say);
          });
          return;
        }

        case "task": {
          const task = intent.task;
          queueTask(task);
          setResponse(intent.say);
          vibrate(30);
          earcon(TASK_SOUND[task.kind]);
          speak(intent.say);
          router.push(intent.path);
          if (task.kind === "scan") {
            // The camera needs the whole screen.
            setOpen(false);
            setPhase("idle");
            return;
          }
          setPose(workingPose(task));
          setPhase("working");
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(
            () => answer("Je n'ai pas réussi à terminer. Réessayez dans un instant.", { pose: workingPose(task), ok: false }),
            TASK_TIMEOUT_MS,
          );
          return;
        }

        case "list-add": {
          if (!user) return needAccount();
          setPose("roule");
          setPhase("working");
          earcon("drop");
          void (async () => {
            const product = await productFor(intent.query);
            if (!product) {
              answer(`Je n'ai pas trouvé ${intent.query}. Essayez un autre nom.`, { pose: "roule", ok: false });
              return;
            }
            try {
              await api.addToList({ barcode: product.barcode, name: product.name ?? intent.query });
              const list = await api.getShoppingList();
              const left = list.items.filter((i) => !i.checked).length;
              answer(
                `${product.name ?? intent.query} ajouté à votre liste. Vous avez ${left} article${left > 1 ? "s" : ""}.`,
                { pose: "plein", ok: true, badge: `${left} article${left > 1 ? "s" : ""}` },
              );
            } catch {
              answer("Je n'ai pas pu l'ajouter. Réessayez.", { pose: "roule", ok: false });
            }
          })();
          return;
        }

        case "list-read": {
          if (!user) return needAccount();
          setPose("roule");
          setPhase("working");
          void (async () => {
            try {
              const list = await api.getShoppingList();
              const left = list.items.filter((i) => !i.checked);
              if (left.length === 0) {
                answer("Votre liste est vide. Dites par exemple : ajoute du lait à ma liste.", { pose: "ecoute", ok: true });
                return;
              }
              const names = left.slice(0, 12).map((i) => i.name ?? i.free_text ?? "article");
              const more = left.length > 12 ? `, et ${left.length - 12} autres` : "";
              answer(
                `Votre liste contient ${left.length} article${left.length > 1 ? "s" : ""} : ${names.join(", ")}${more}.`,
                { pose: "plein", ok: true, badge: `${left.length} article${left.length > 1 ? "s" : ""}` },
              );
            } catch {
              answer("Je n'ai pas pu lire votre liste.", { pose: "roule", ok: false });
            }
          })();
          return;
        }

        case "alert-add": {
          if (!user) return needAccount();
          setPose("loupe");
          setPhase("working");
          earcon("radar");
          void (async () => {
            const product = await productFor(intent.query);
            if (!product) {
              answer(`Je n'ai pas trouvé ${intent.query}.`, { pose: "loupe", ok: false });
              return;
            }
            try {
              await api.createAlert({ barcode: product.barcode });
              answer(`Alerte créée. Je vous préviens dès que ${product.name ?? intent.query} baisse.`, {
                pose: "loupe",
                ok: true,
                badge: "Alerte",
              });
            } catch (e) {
              const exists = e instanceof ApiError && e.status === 409;
              answer(exists ? "Vous avez déjà une alerte sur ce produit." : "Je n'ai pas pu créer l'alerte.", {
                pose: "loupe",
                ok: exists,
              });
            }
          })();
          return;
        }

        case "premium":
          close();
          openPremium(true);
          speak(intent.say);
          return;

        case "navigate":
          router.push(intent.path);
          answer(intent.say, { pose: "roule", ok: true });
          return;

        case "setting":
          if (intent.action === "dark") a11y.setDark(true);
          else if (intent.action === "light") a11y.setDark(false);
          else if (intent.action === "bigger") a11y.biggerText();
          else if (intent.action === "smaller") a11y.smallerText();
          else if (intent.action === "contrast") a11y.toggleContrast();
          answer(intent.say, { pose: "ecoute", ok: true });
          return;

        case "read": {
          const content = readPageAloud();
          answer(content || "Il n'y a rien à lire sur cette page.", { pose: "ecoute", ok: !!content });
          return;
        }

        case "help":
          answer(intent.say, { pose: "ecoute", ok: true });
          return;

        case "unknown":
          answer(intent.say, { pose: "ecoute", ok: false });
          return;
      }
    },
    [router, a11y, runSearch, productFor, answer, close, needAccount, openPremium, queueTask, setOpen, stopListening, user],
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
    setBadge(null);
    setPose("ecoute");
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
      earcon("error");
      setResponse(
        kind === "not-allowed"
          ? "Je n'ai pas accès au micro. Autorisez le microphone dans les réglages."
          : "Je n'ai pas pu écouter. Touchez le micro et réessayez.",
      );
    };
    rec.onEnd = () => {
      setPhase((p) => (p === "listening" ? "idle" : p));
    };
    rec.start();
    setPhase("listening");
    earcon("listen");
    vibrate(30);
  }, [act]);

  useEffect(() => {
    startRef.current = startListening;
  }, [startListening]);

  // When the assistant opens (central mic, home page, header), greet and listen —
  // or, when it was opened by tapping an example, run that sentence directly.
  const greetedRef = useRef(false);
  useEffect(() => {
    if (open && !greetedRef.current) {
      greetedRef.current = true;
      const { phrase, set } = useVoicePhrase.getState();
      if (phrase) {
        set(null);
        setTranscript(phrase);
        act(phrase);
        return;
      }
      speak("Je vous écoute.");
      setTimeout(startListening, 450);
    } else if (!open) {
      greetedRef.current = false;
    }
  }, [open, startListening, act]);

  const dialogRef = useDialog(open, close);

  const scene: SceneState =
    phase === "working" ? "working" : phase === "done" ? "done" : phase === "error" ? "failed" : "listening";
  const status =
    phase === "listening"
      ? "Je vous écoute…"
      : phase === "working"
        ? "Je m'en occupe…"
        : phase === "done" || phase === "error"
          ? "Touchez le micro pour une autre demande"
          : "Touchez le micro et parlez";

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
            // `zoom` enlarges this sheet after its 90vh cap is computed, so at max
            // text size it could push the close button off-screen; dividing by
            // --zoom-scale prevents that.
            className="max-h-[calc(92vh/var(--zoom-scale,1))] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-surface-container-lowest p-5 pb-8 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
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
                {"La reconnaissance vocale n'est pas disponible ici. Essayez Chrome ou Safari, ou touchez un exemple ci-dessous."}
              </p>
            ) : null}

            <MascotScene pose={pose} state={scene} badge={badge} />

            {/* What was heard, and the answer — also for deaf and hard-of-hearing users. */}
            <div className="mt-3 min-h-[44px] space-y-2" aria-live="polite">
              {transcript && (
                <p className="rounded-xl bg-surface-container px-4 py-3 text-body-lg text-on-surface">« {transcript} »</p>
              )}
              {response && (
                <p className="flex items-start gap-2 rounded-xl bg-primary/10 px-4 py-3 text-body-lg font-semibold text-primary">
                  <Icon name="volume_up" className="mt-0.5 flex-shrink-0" /> {response}
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                onClick={startListening}
                aria-label={phase === "listening" ? "J'écoute" : "Parler"}
                className={`relative grid h-20 w-20 place-items-center rounded-full text-on-primary shadow-float transition-colors ${
                  phase === "listening" ? "bg-accent-warm" : "bg-primary"
                }`}
              >
                {phase === "listening" && <span className="absolute inset-0 animate-ping rounded-full bg-accent-warm/40" />}
                <Icon name={phase === "listening" ? "graphic_eq" : "mic"} fill style={{ fontSize: 40 }} className="relative" />
              </button>
              <p className="text-label-lg text-on-surface-variant">{status}</p>
            </div>

            <button
              onClick={() => setHandsFree((v) => !v)}
              role="switch"
              aria-checked={handsFree}
              className="mt-4 flex w-full items-center justify-between rounded-xl border border-outline-variant/30 p-3 text-left"
            >
              <span className="flex items-center gap-2 text-label-lg text-on-surface">
                <Icon name="hearing" className="text-primary" /> Écoute mains-libres
              </span>
              <span className={`relative h-7 w-12 rounded-full transition-colors ${handsFree ? "bg-primary" : "bg-surface-variant"}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${handsFree ? "left-6" : "left-1"}`} />
              </span>
            </button>

            <p className="mb-2 mt-4 text-label-md text-on-surface-variant">Essayez :</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setTranscript(ex);
                    act(ex);
                  }}
                  className="chip chip-idle text-label-md"
                >
                  « {ex} »
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
