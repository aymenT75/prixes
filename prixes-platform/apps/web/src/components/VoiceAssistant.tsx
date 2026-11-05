"use client";

/**
 * L'assistant vocal — the brain of the app.
 *
 * Every microphone ends up here, full screen. A sentence becomes an intent
 * (lib/voice): add to the list, remove from it, read it, look up a price, open a
 * screen, start the in-store guide, change a setting. The answer is shown and
 * said aloud. Whoever cannot speak types the same sentences in the field below.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { Icon } from "@/components/Icon";
import { allergensIn } from "@/lib/allergens";
import { trackVoice } from "@/lib/analytics";
import { api } from "@/lib/api";
import { useGuideRequest } from "@/lib/courses";
import { earcon } from "@/lib/earcons";
import { isNetworkError, isOffline } from "@/lib/offline";
import { screenReaderOn, talk } from "@/lib/say";
import { useApp } from "@/lib/store";
import type { SearchHit } from "@/lib/types";
import { useA11y } from "@/lib/useA11y";
import { useDialog } from "@/lib/useDialog";
import {
  createVoiceRecognizer,
  parseIntent,
  readPageAloud,
  speechSupported,
  stopSpeaking,
  vibrate,
  type VoiceRecognizer,
} from "@/lib/voice";
import { spokenPrice, useVoiceGreeting } from "@/lib/voiceTasks";

type Phase = "idle" | "listening" | "working" | "done" | "error";

/** "ajoute-le", "ajoute ça à ma liste": the product just talked about. */
const PRONOUN = /^(le|la|les|l'|ca|ça|cela|celui-ci|celle-ci|ce produit)$/;

/** Lowercase, no accents — to compare a spoken word with a product name. */
function strip(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
/**
 * The words of `query` as they were said: parseIntent works on a lowercase,
 * accent-free copy, and "beurre salé" must reach the list with its accent.
 */
function asSpoken(text: string, query: string): string {
  const said = text.split(/\s+/);
  const want = query.split(/\s+/);
  const bare = (w: string) => strip(w).replace(/[^a-z0-9'-]/g, "");
  for (let i = 0; i + want.length <= said.length; i++) {
    if (want.every((w, j) => bare(said[i + j]) === w)) {
      return said.slice(i, i + want.length).join(" ").replace(/[.,!?]+$/, "").toLowerCase();
    }
  }
  return query;
}
const STOP = new Set(["des", "les", "une", "pour", "avec", "sans", "aux"]);

/** Said instead of silence when a request needs the network and there is none. */
const OFFLINE_SAY =
  "Pas de réseau pour le moment. Je peux quand même lire votre liste, ou y ajouter des articles.";

/** Once per launch: the shortcut or "listen on open" must not reopen it on every page. */
let launchHandled = false;

/** Opens the assistant as if the user had asked: greets with the question, then listens. */
export function openWithGreeting() {
  useVoiceGreeting.getState().set("Bonjour.");
  useA11y.getState().setVoiceOpen(true);
}

export function VoiceAssistant() {
  const router = useRouter();
  const qc = useQueryClient();
  const a11y = useA11y();
  const { user, openLogin } = useApp();
  const open = useA11y((s) => s.voiceOpen);
  const setOpen = useA11y((s) => s.setVoiceOpen);

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [typed, setTyped] = useState("");
  const [supported, setSupported] = useState(true);
  const recRef = useRef<VoiceRecognizer | null>(null);
  const handledRef = useRef(false);
  // Conversation: after each answer the mic reopens, until silence or "merci".
  const conversation = useA11y((s) => s.conversation);
  const conversationRef = useRef(true);
  const openRef = useRef(false);
  const startRef = useRef<() => void>(() => {});
  // The follow-up the assistant just offered ("Je l'ajoute à votre liste ?"),
  // done on a spoken "oui". One step instead of finding and touching a button.
  const pendingRef = useRef<{ yes: () => void; no?: () => void } | null>(null);
  // The product last talked about, so "ajoute-le" needs no name.
  const lastProductRef = useRef<{ barcode: string; name: string } | null>(null);
  // Read at the moment of acting: a question asked before the session loaded
  // (the app just opened) must not answer "connectez-vous" to a signed-in user.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    setSupported(speechSupported());
  }, []);
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);
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
    setOpen(false);
    setPhase("idle");
    setTranscript("");
    setResponse("");
    setTyped("");
  }, [setOpen, stopListening]);

  /**
   * Show, say and sound an answer; then listen again in hands-free mode. With
   * `ask`, the answer ends on a question: the mic reopens by itself once it has
   * been said, and a "oui" runs `ask` — no second tap on the mic. Under VoiceOver
   * the mic stays shut: it would hear VoiceOver reading the answer.
   */
  const answer = useCallback(
    (say: string, next: { ok: boolean; ask?: () => void; no?: () => void }) => {
      pendingRef.current = next.ask ? { yes: next.ask, no: next.no } : null;
      setPhase(next.ok ? "done" : "error");
      setResponse(say);
      earcon(next.ok ? "success" : "error");
      vibrate(next.ok ? 40 : [60, 60, 60]);
      const asked = !!next.ask;
      talk(say, () => {
        if ((asked || conversationRef.current) && openRef.current && !screenReaderOn()) {
          setTimeout(() => startRef.current(), 400);
        }
      });
    },
    [],
  );

  /** Put one product on the list and say how long the list is now. */
  const addProduct = useCallback(
    async (product: { barcode: string; name: string }) => {
      setPhase("working");
      earcon("drop");
      try {
        await api.addToList({ barcode: product.barcode, name: product.name });
        qc.invalidateQueries({ queryKey: ["shopping"] });
        const list = await api.getShoppingList();
        const left = list.items.filter((i) => !i.checked).length;
        const later = list.offline ? " Pas de réseau : je l'enverrai dès qu'il revient." : "";
        answer(`${product.name} ajouté à votre liste. Vous avez ${left} produit${left > 1 ? "s" : ""}.${later}`, {
          ok: true,
        });
      } catch {
        answer("Je n'ai pas pu l'ajouter. Réessayez.", { ok: false });
      }
    },
    [answer, qc],
  );

  // Runs a product search, retrying with a shorter phrase if nothing matches
  // ("du lait bio" -> "du lait"). Returns the candidates, best first, so a "non"
  // to the first offer can propose the next one.
  const runSearch = useCallback(async (query: string): Promise<{ q: string; items: SearchHit[]; unreachable?: boolean }> => {
    let q = query;
    let found: Awaited<ReturnType<typeof api.searchProducts>> | null = null;
    try {
      found = await api.searchProducts(q);
    } catch (e) {
      if (isNetworkError(e)) return { q, items: [], unreachable: true };
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
    const items = (found?.items ?? []).filter((i) => i.barcode);
    // "lait" must not offer "Laitue" as another choice: keep the products whose
    // name has the searched word, when there are any.
    const words = strip(q).split(" ").filter((w) => w.length > 2 && !STOP.has(w));
    const named = items.filter((i) => {
      const name = strip(i.name ?? "");
      return words.every((w) => new RegExp(`(^|[^a-z])${w}s?($|[^a-z])`).test(name));
    });
    // "lait" means milk: "lait de coco", "lait d'amande" are other products and
    // come after it, even when cheaper (the search ranks by price).
    const qualified = (name: string | null) =>
      words.some((w) => new RegExp(`(^|[^a-z])${w}s? (de|d'|a la|au|aux) `).test(strip(name ?? "")));
    const pool = named.length ? named : items;
    const ranked = [...pool.filter((i) => !qualified(i.name)), ...pool.filter((i) => qualified(i.name))];
    return { q, items: ranked.slice(0, 6) };
  }, []);

  /** Says goodbye and closes: the conversation is over, the mic stops reopening. */
  const goodbye = useCallback(
    (say: string) => {
      setPhase("done");
      setResponse(say);
      earcon("success");
      let closed = false;
      const end = () => {
        if (closed) return;
        closed = true;
        close();
      };
      talk(say, end);
      setTimeout(end, 4000); // never stay open if the voice never reports its end
    },
    [close],
  );

  const needAccount = useCallback(() => {
    answer("Il faut d'abord vous connecter. J'ouvre la connexion.", { ok: false });
    setTimeout(() => {
      close();
      openLogin(true);
    }, 2500);
  }, [answer, close, openLogin]);

  const act = useCallback(
    (text: string) => {
      const intent = parseIntent(text);
      trackVoice(intent.type);
      stopListening();
      setResponse("");
      // A question only waits for the very next sentence: anything else drops it.
      const pending = pendingRef.current;
      pendingRef.current = null;

      if (isOffline() && intent.type === "search") {
        answer(OFFLINE_SAY, { ok: false });
        return;
      }

      switch (intent.type) {
        case "confirm":
          // "ajoute-le" answers both questions at once: straight onto the list.
          if (/\b(ajoute|mets)\b/.test(text.toLowerCase()) && lastProductRef.current) {
            if (!userRef.current) return needAccount();
            void addProduct(lastProductRef.current);
            return;
          }
          if (pending) {
            pending.yes();
            return;
          }
          answer("Que voulez-vous faire ? Dites par exemple : ajoute du lait.", { ok: true });
          return;

        case "cancel":
          if (pending?.no) {
            pending.no();
            return;
          }
          goodbye(intent.say);
          return;

        case "bye":
          goodbye(intent.say);
          return;

        case "search": {
          setPhase("working");
          earcon("radar");
          vibrate(30);
          const profile = a11y.allergens;
          void runSearch(intent.query).then(({ items, unreachable }) => {
            if (unreachable) {
              answer(OFFLINE_SAY, { ok: false });
              return;
            }
            if (!items.length) {
              answer(`Je n'ai pas trouvé ${intent.query}. Essayez un autre nom.`, { ok: false });
              return;
            }
            // "Je l'ajoute à votre liste ?" — oui: added; non: the next product.
            const offer = (i: number) => {
              const hit = items[i];
              const name = hit.name ?? intent.query;
              const product = { barcode: hit.barcode, name };
              lastProductRef.current = product;
              const danger = allergensIn(hit.allergens, profile);
              const warn = danger.length ? `Attention, contient ${danger.join(", ")}. ` : "";
              const price =
                hit.best_price != null
                  ? `${spokenPrice(hit.best_price)}${hit.best_store ? ` chez ${hit.best_store}` : ""}`
                  : "pas encore de prix connu";
              const intro = i === 0 ? "" : "Autre choix : ";
              answer(`${intro}${warn}${name} : ${price}. Je l'ajoute à votre liste ?`, {
                ok: true,
                ask: () => {
                  if (!userRef.current) return needAccount();
                  void addProduct(product);
                },
                no: () => {
                  if (i + 1 < items.length) offer(i + 1);
                  else answer(`Je n'ai pas d'autre choix pour ${intent.query}. Dites un autre produit.`, { ok: false });
                },
              });
            };
            offer(0);
          });
          return;
        }

        case "guide":
          if (!userRef.current) return needAccount();
          // The guide takes the whole screen and listens on its own: two
          // microphones at once would answer each other.
          useGuideRequest.setState({ asked: true });
          close();
          router.push("/ou-aller");
          return;

        case "list-add": {
          if (!userRef.current) return needAccount();
          const last = lastProductRef.current;
          if (PRONOUN.test(intent.query.trim().toLowerCase())) {
            if (last) void addProduct(last);
            else answer("Quel produit ? Dites par exemple : ajoute du lait.", { ok: false });
            return;
          }
          setPhase("working");
          earcon("drop");
          if (isOffline()) {
            // No catalogue to look it up in: keep the words, matched once online.
            void (async () => {
              const words = asSpoken(text, intent.query);
              try {
                await api.addFreeTextToList(words);
                qc.invalidateQueries({ queryKey: ["shopping"] });
                const list = await api.getShoppingList();
                const left = list.items.filter((i) => !i.checked).length;
                answer(
                  `${words} noté. Vous avez ${left} produit${left > 1 ? "s" : ""}. ` +
                    "Pas de réseau : je l'enverrai dès qu'il revient.",
                  { ok: true },
                );
              } catch {
                answer("Je n'ai pas pu le noter.", { ok: false });
              }
            })();
            return;
          }
          void (async () => {
            // Same ranking as a spoken search: "ajoute du lait" adds milk, not
            // the cheapest "lait de coco" (full-circuit test, 07/10).
            const { items } = await runSearch(intent.query);
            const product = items[0];
            if (!product) {
              answer(`Je n'ai pas trouvé ${intent.query}. Essayez un autre nom.`, { ok: false });
              return;
            }
            const found = { barcode: product.barcode, name: product.name ?? intent.query };
            lastProductRef.current = found;
            const danger = allergensIn(product.allergens, a11y.allergens);
            if (danger.length) {
              // Never added silently: the warning comes first, and the choice is theirs.
              answer(`Attention, ${found.name} contient ${danger.join(", ")}. Je l'ajoute quand même ?`, {
                ok: false,
                ask: () => void addProduct(found),
                no: () => answer("D'accord, je ne l'ajoute pas.", { ok: true }),
              });
              return;
            }
            await addProduct(found);
          })();
          return;
        }

        case "list-remove": {
          if (!userRef.current) return needAccount();
          setPhase("working");
          void (async () => {
            try {
              const list = await api.getShoppingList();
              const want = strip(intent.query);
              const line = list.items.find((i) => strip(i.name ?? i.free_text ?? "").includes(want));
              if (!line) {
                answer(`Je ne trouve pas ${intent.query} sur votre liste.`, { ok: false });
                return;
              }
              await api.removeListItem(line.id);
              qc.invalidateQueries({ queryKey: ["shopping"] });
              answer(`${line.name ?? line.free_text} retiré de votre liste.`, { ok: true });
            } catch {
              answer("Je n'ai pas pu le retirer. Réessayez.", { ok: false });
            }
          })();
          return;
        }

        case "list-read": {
          if (!userRef.current) return needAccount();
          setPhase("working");
          void (async () => {
            try {
              const list = await api.getShoppingList();
              const left = list.items.filter((i) => !i.checked);
              if (left.length === 0) {
                answer("Votre liste est vide. Dites par exemple : ajoute du lait.", { ok: true });
                return;
              }
              const names = left.slice(0, 12).map((i) => {
                const danger = allergensIn(i.allergens, a11y.allergens);
                const n = i.name ?? i.free_text ?? "produit";
                return danger.length ? `${n}, attention, contient ${danger.join(", ")}` : n;
              });
              const more = left.length > 12 ? `, et ${left.length - 12} autres` : "";
              const saved = list.offline ? "Sans réseau, voici votre liste enregistrée. " : "";
              answer(
                `${saved}Votre liste contient ${left.length} produit${left.length > 1 ? "s" : ""} : ${names.join(", ")}${more}.`,
                { ok: true },
              );
            } catch {
              answer("Je n'ai pas pu lire votre liste.", { ok: false });
            }
          })();
          return;
        }

        case "navigate":
          // The screen says what it shows when it opens.
          close();
          router.push(intent.path);
          return;

        case "setting":
          if (intent.action === "dark") a11y.setDark(true);
          else if (intent.action === "light") a11y.setDark(false);
          else if (intent.action === "bigger") a11y.biggerText();
          else if (intent.action === "smaller") a11y.smallerText();
          else if (intent.action === "contrast") a11y.toggleContrast();
          answer(intent.say, { ok: true });
          return;

        case "read": {
          const content = readPageAloud();
          answer(content || "Il n'y a rien à lire sur cette page.", { ok: !!content });
          return;
        }

        case "help":
          answer(intent.say, { ok: true });
          return;

        case "unknown":
          answer(intent.say, { ok: false });
          return;
      }
    },
    [router, a11y, qc, runSearch, answer, addProduct, close, goodbye, needAccount, stopListening],
  );

  const startListening = useCallback(() => {
    if (!speechSupported()) {
      setSupported(false);
      return;
    }
    stopSpeaking();
    handledRef.current = false;
    setTranscript("");
    // The last answer stays on screen while the mic listens again: after a
    // question ("Je l'ajoute ?") someone who cannot hear keeps the question.
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
      if (kind === "silence") {
        // Nothing said: the conversation just stops, quietly — no error sound.
        setPhase("idle");
        return;
      }
      setPhase("error");
      earcon("error");
      setResponse(
        kind === "not-allowed"
          ? "Je n'ai pas accès au micro. Autorisez le microphone dans les réglages, ou écrivez ci-dessous."
          : "Je n'ai pas pu écouter. Touchez Parler et réessayez.",
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

  // When the assistant opens, greet and listen.
  const greetedRef = useRef(false);
  useEffect(() => {
    if (open && !greetedRef.current) {
      greetedRef.current = true;
      const { greeting, set: clearGreeting } = useVoiceGreeting.getState();
      clearGreeting(null);
      const text = greeting ? `${greeting} Que voulez-vous faire ?` : "Je vous écoute.";
      // Listen once the greeting has been said — starting the mic earlier cut it off.
      let started = false;
      const listen = () => {
        if (started || !openRef.current || screenReaderOn()) return;
        started = true;
        startListening();
      };
      talk(text, listen);
      setTimeout(listen, text.length > 30 ? 3000 + text.length * 60 : 1500);
    } else if (!open) {
      greetedRef.current = false;
    }
  }, [open, startListening]);

  // Opened without a tap: the "Parler à Prixes" shortcut (?voice=1 — web; the
  // native app gets it through NativeSetup), or "Écouter dès l'ouverture".
  const a11yReady = useA11y((s) => s.ready);
  const listenOnOpen = useA11y((s) => s.listenOnOpen);
  useEffect(() => {
    if (!a11yReady || launchHandled) return;
    launchHandled = true;
    const params = new URLSearchParams(window.location.search);
    const fromShortcut = params.get("voice") === "1";
    if (fromShortcut) {
      params.delete("voice");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }
    if (fromShortcut || listenOnOpen) openWithGreeting();
  }, [a11yReady, listenOnOpen]);

  const dialogRef = useDialog(open, close);

  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const t = typed.trim();
    if (!t) return;
    setTyped("");
    setTranscript(t);
    act(t);
  }

  if (!open) return null;

  const listening = phase === "listening";
  const title = listening
    ? "Je vous écoute"
    : phase === "working"
      ? "Je m'en occupe"
      : "Que voulez-vous faire ?";

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Assistant vocal Prixes"
      className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+12px)] outline-none"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 [zoom:calc(1/var(--zoom-scale,1))]">
        <header className="flex min-h-16 items-center justify-between gap-2">
          <h2 className="text-[28px] font-bold leading-tight text-on-surface" aria-live="polite">
            {title}
          </h2>
          <button
            onClick={close}
            aria-label="Fermer l'assistant"
            className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-full border-[3px] border-[rgb(var(--color-btn-line))] text-on-surface"
          >
            <Icon name="close" className="text-[36px]" />
          </button>
        </header>

        {/* Listening shows in shape, not only in colour: the bars move and the
            word changes, for anyone who cannot hear the "bip". */}
        <div
          aria-hidden
          className="relative mx-auto mt-1 grid h-[150px] w-[150px] flex-shrink-0 place-items-center rounded-full bg-primary-container text-on-primary-container"
        >
          {listening && (
            <>
              <span className="prixes-ripple" />
              <span className="prixes-ripple" />
            </>
          )}
          <Icon name={listening ? "graphic_eq" : "mic"} fill className="relative text-[84px]" />
        </div>

        {!supported && (
          <p role="alert" className="text-[22px] leading-snug text-on-surface">
            Ce téléphone ne peut pas m&apos;écouter ici. Écrivez votre demande ci-dessous.
          </p>
        )}

        <div className="flex flex-col gap-3" aria-live="polite">
          {transcript && (
            <p className="break-words rounded-[20px] border-2 border-[rgb(var(--color-btn-line))] bg-surface-container-lowest p-4 text-[25px] leading-tight text-on-surface">
              <span className="mb-1 block text-[19px] font-bold">Vous</span>
              {transcript}
            </p>
          )}
          {response && (
            <p className="break-words rounded-[20px] border-2 border-[rgb(var(--color-btn-line))] bg-surface-container-lowest p-4 text-[25px] leading-tight text-on-surface">
              <span className="mb-1 block text-[19px] font-bold">Prixes</span>
              {response}
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <form onSubmit={submitTyped} className="flex flex-col gap-1">
            <label htmlFor="voice-typed" className="text-[20px] font-bold text-on-surface">
              Ou écrivez ici
            </label>
            <div className="flex gap-2">
              <input
                id="voice-typed"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                enterKeyHint="send"
                autoComplete="off"
                className="min-h-[64px] min-w-0 flex-1 rounded-[18px] border-[3px] border-[rgb(var(--color-btn-line))] bg-surface-container-lowest px-4 text-[22px] text-on-surface"
              />
              <button
                type="submit"
                aria-label="Envoyer"
                className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-[18px] border-[3px] border-[rgb(var(--color-btn-line))] text-on-surface"
              >
                <Icon name="send" className="text-[32px]" />
              </button>
            </div>
          </form>
          {supported && (
            <button
              onClick={listening ? stopListening : startListening}
              className="big-btn big-btn-main justify-center"
            >
              <Icon name={listening ? "stop_circle" : "mic"} fill className="text-[44px]" />
              {listening ? "Arrêter" : "Parler"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
