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
import { useQueryClient } from "@tanstack/react-query";

import { Icon } from "@/components/Icon";
import { MascotScene, type SceneState } from "@/components/MascotScene";
import { trackVoice } from "@/lib/analytics";
import { ApiError, api } from "@/lib/api";
import type { SearchHit } from "@/lib/types";
import { earcon, type Earcon } from "@/lib/earcons";
import { useApp } from "@/lib/store";
import { useStoreAdvice } from "@/lib/courses";
import { dropsSentence, loadNews, markMenuOffered, markNewsTold, useNews } from "@/lib/news";
import { isNetworkError, isOffline } from "@/lib/offline";
import { nativePlatform } from "@/lib/platform";
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
import {
  spokenPrice,
  useVoiceGreeting,
  useVoicePhrase,
  useVoiceTask,
  workingPose,
  type Pose,
  type BasketLine,
  type VoiceTask,
} from "@/lib/voiceTasks";

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

/** "ajoute-le", "ajoute ça à ma liste": the product just talked about. */
const PRONOUN = /^(le|la|les|l'|ca|ça|cela|celui-ci|celle-ci|ce produit)$/;

/** Matches the product page's rule: a profile allergen named in the product's list. */
function allergensIn(productAllergens: string | null | undefined, profile: string[]): string[] {
  const list = (productAllergens ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return list.filter((a) =>
    profile.some((p) => a.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(a.toLowerCase())),
  );
}

/** Lowercase, no accents — to compare a spoken word with a product name. */
function strip(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

/** Kinds of request that cannot be done on the phone alone. */
const NEEDS_NETWORK = new Set(["search", "task", "alert-add", "premium", "news"]);

const MENU_READY_ASK = "Votre menu de la semaine est prêt. Je mets les courses dans votre liste ?";

/** Once per launch: the shortcut or "listen on open" must not reopen it on every page. */
let launchHandled = false;

/** Opens the assistant as if the user had asked: greets with the question, then listens. */
export function openWithGreeting() {
  useVoiceGreeting.getState().set("Bonjour.");
  useA11y.getState().setVoiceOpen(true);
}

/** A page that never reports back (location refused, network down) must not leave the Caddie rolling forever. */
const TASK_TIMEOUT_MS = 45_000;

export function VoiceAssistant() {
  const router = useRouter();
  const qc = useQueryClient();
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
  const recRef = useRef<VoiceRecognizer | null>(null);
  const handledRef = useRef(false);
  // Conversation: after each answer the mic reopens, until silence or "merci".
  const conversation = useA11y((s) => s.conversation);
  const setConversation = useA11y((s) => s.setConversation);
  const conversationRef = useRef(true);
  const openRef = useRef(false);
  const startRef = useRef<() => void>(() => {});
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(false);
    setPhase("idle");
    setBadge(null);
  }, [setOpen, stopListening]);

  /**
   * Show, say and sound an answer; then listen again in hands-free mode. With
   * `ask`, the answer ends on a question: the mic reopens by itself once it has
   * been said, and a "oui" runs `ask` — no second tap on the mic.
   */
  const answer = useCallback(
    (say: string, next: { pose: Pose; ok: boolean; badge?: string | null; ask?: () => void; no?: () => void }) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      pendingRef.current = next.ask ? { yes: next.ask, no: next.no } : null;
      setPose(next.pose);
      setBadge(next.badge ?? null);
      setPhase(next.ok ? "done" : "error");
      setResponse(say);
      earcon(next.ok ? "success" : "error");
      vibrate(next.ok ? 40 : [60, 60, 60]);
      const asked = !!next.ask;
      speak(say, () => {
        if ((asked || conversationRef.current) && openRef.current) setTimeout(() => startRef.current(), 400);
      });
    },
    [],
  );

  /** Put one product on the list and say how long the list is now. */
  const addProduct = useCallback(
    async (product: { barcode: string; name: string }) => {
      setPose("roule");
      setPhase("working");
      earcon("drop");
      try {
        await api.addToList({ barcode: product.barcode, name: product.name });
        qc.invalidateQueries({ queryKey: ["shopping"] });
        const list = await api.getShoppingList();
        const left = list.items.filter((i) => !i.checked).length;
        const later = list.offline ? " Pas de réseau : je l'enverrai dès qu'il revient." : "";
        answer(`${product.name} ajouté à votre liste. Vous avez ${left} article${left > 1 ? "s" : ""}.${later}`, {
          pose: "plein",
          ok: true,
          badge: `${left} article${left > 1 ? "s" : ""}`,
        });
      } catch {
        answer("Je n'ai pas pu l'ajouter. Réessayez.", { pose: "roule", ok: false });
      }
    },
    [answer, qc],
  );

  /** A stored week's groceries onto the list — the "oui" to the Sunday menu. */
  const addWeekBasket = useCallback(
    async (week: string) => {
      markMenuOffered();
      setPose("roule");
      setPhase("working");
      try {
        const plan = await api.getMealPlan(week);
        const items: BasketLine[] = (plan?.basket ?? [])
          .filter((line) => !line.optional)
          .map((line) => ({
            barcode: line.barcode,
            free_text: line.barcode ? null : line.product_name,
            name: line.matched_name ?? line.product_name,
            quantity: line.quantity,
            amount: line.amount,
            unit: line.unit,
            source: "mealplan",
          }));
        await addMenuBasketRef.current(items);
      } catch {
        answer("Je n'ai pas retrouvé ce menu. Ouvrez l'onglet Menu.", { pose: "assiette", ok: false });
      }
    },
    [answer],
  );
  const addMenuBasketRef = useRef<(items: BasketLine[]) => Promise<void>>(async () => {});

  /** The week's menu groceries onto the list — the "oui" after "compose mon menu". */
  const addMenuBasket = useCallback(
    async (items: BasketLine[]) => {
      setPose("roule");
      setPhase("working");
      earcon("drop");
      if (!items.length) {
        answer("Je ne trouve pas de courses pour ce menu.", { pose: "assiette", ok: false });
        return;
      }
      try {
        const res = await api.addBasketToList(items);
        qc.invalidateQueries({ queryKey: ["shopping"] });
        const n = res.added + res.merged;
        answer(`C'est fait : ${n} article${n > 1 ? "s" : ""} du menu dans votre liste.`, {
          pose: "plein",
          ok: true,
          badge: `${n} article${n > 1 ? "s" : ""}`,
        });
      } catch {
        answer("Je n'ai pas pu mettre les courses dans votre liste.", { pose: "roule", ok: false });
      }
    },
    [answer, qc],
  );

  useEffect(() => {
    addMenuBasketRef.current = addMenuBasket;
  }, [addMenuBasket]);

  // A page finished the task it was given: show and say its answer.
  useEffect(() => {
    if (!result) return;
    clearResult();
    // The assistant may have been closed meanwhile; the answer is still said.
    if (!openRef.current) {
      speak(result.say);
      return;
    }
    const offer = result.offer;
    if (offer?.kind === "store-pick") {
      answer(result.say, {
        pose: result.pose,
        ok: result.ok,
        ask: () => {
          useStoreAdvice.getState().accept?.();
          answer(
            `C'est parti pour ${offer.store}. Votre liste est rangée par rayon. Au magasin, touchez « me guider » et je vous lis chaque produit.`,
            { pose: "roule", ok: true },
          );
        },
        no: () =>
          answer("D'accord. Choisissez une autre enseigne à l'écran, ou bougez le curseur vers le plus proche.", {
            pose: "ecoute",
            ok: true,
          }),
      });
      return;
    }
    const ask = offer?.kind === "menu-basket" ? () => void addMenuBasket(offer.items) : undefined;
    answer(result.say, { pose: result.pose, ok: result.ok, ask });
  }, [result, clearResult, answer, addMenuBasket]);

  // Runs a product search, retrying with a shorter phrase if nothing matches
  // ("du lait bio" -> "du lait"). Returns the candidates, best first, so a "non"
  // to the first price can offer the next one.
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

  /** The first catalogue product a spoken name designates, or null. */
  // Same ranking as a spoken search: "ajoute du lait" adds milk, not the
  // cheapest "lait de coco" (seen on the full-circuit test, 07/10).
  const productFor = useCallback(
    async (query: string) => {
      const { items } = await runSearch(query);
      return items[0] ?? null;
    },
    [runSearch],
  );

  /** Says goodbye and closes: the conversation is over, the mic stops reopening. */
  const goodbye = useCallback(
    (say: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setPose("ecoute");
      setPhase("done");
      setResponse(say);
      earcon("success");
      let closed = false;
      const end = () => {
        if (closed) return;
        closed = true;
        close();
      };
      speak(say, end);
      setTimeout(end, 4000); // never stay open if the voice never reports its end
    },
    [close],
  );

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
      trackVoice(intent.type === "task" ? `task:${intent.task.kind}` : intent.type);
      stopListening();
      setResponse("");
      setBadge(null);
      // A question only waits for the very next sentence: anything else drops it.
      const pending = pendingRef.current;
      pendingRef.current = null;

      if (isOffline() && NEEDS_NETWORK.has(intent.type)) {
        answer(OFFLINE_SAY, { pose: "ecoute", ok: false });
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
          answer("Que voulez-vous faire ? Dites par exemple : cherche du lait.", { pose: "ecoute", ok: true });
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

        case "news": {
          if (!userRef.current) return needAccount();
          setPose("loupe");
          setPhase("working");
          void api
            .getNews()
            .then(({ drops, menu_ready }) => {
              markNewsTold();
              const said = dropsSentence(drops) ?? "Rien n'a baissé ces deux dernières semaines sur votre liste.";
              if (menu_ready) {
                answer(`${said} ${MENU_READY_ASK}`, {
                  pose: "plein",
                  ok: true,
                  ask: () => void addWeekBasket(menu_ready),
                  no: () => {
                    markMenuOffered();
                    answer("D'accord. Votre menu vous attend dans l'onglet Menu.", { pose: "assiette", ok: true });
                  },
                });
                return;
              }
              answer(said, { pose: drops.length ? "plein" : "loupe", ok: true });
            })
            .catch(() => answer("Je n'ai pas pu regarder. Réessayez.", { pose: "loupe", ok: false }));
          return;
        }

        case "search": {
          setPose("loupe");
          setPhase("working");
          earcon("radar");
          vibrate(30);
          const profile = a11y.allergens;
          void runSearch(intent.query).then(({ items, unreachable }) => {
            if (unreachable) {
              answer(OFFLINE_SAY, { pose: "ecoute", ok: false });
              return;
            }
            if (!items.length) {
              answer(`Je n'ai pas trouvé ${intent.query}. Essayez un autre nom.`, { pose: "loupe", ok: false });
              return;
            }
            // 1) "Ce prix vous convient ?" — non: the next product; oui: 2).
            // 2) "Je l'ajoute à votre liste ?" — oui: added. All by voice.
            const offer = (i: number) => {
              const hit = items[i];
              const name = hit.name ?? intent.query;
              const product = { barcode: hit.barcode, name };
              lastProductRef.current = product;
              // Shown behind the assistant, which keeps talking (the page stays quiet).
              router.push(`/courses/detail?barcode=${encodeURIComponent(hit.barcode)}&from=voice`);
              const danger = allergensIn(hit.allergens, profile);
              const warn = danger.length ? `Attention, contient ${danger.join(", ")}. ` : "";
              const price =
                hit.best_price != null
                  ? `${spokenPrice(hit.best_price)}${hit.best_store ? ` chez ${hit.best_store}` : ""}`
                  : "pas encore de prix connu";
              const grade = (hit.nutriscore ?? "").toUpperCase();
              const nutri = grade === "D" || grade === "E" ? ` Nutri-Score ${grade}, faible.` : "";
              const intro = i === 0 ? "" : "Autre choix : ";
              answer(`${intro}${warn}${name} : ${price}.${nutri} Ce prix vous convient ?`, {
                pose: "plein",
                ok: true,
                ask: () => {
                  if (!userRef.current) {
                    needAccount();
                    return;
                  }
                  answer("Je l'ajoute à votre liste ?", {
                    pose: "plein",
                    ok: true,
                    ask: () => void addProduct(product),
                    no: () => answer("D'accord, je ne l'ajoute pas.", { pose: "ecoute", ok: true }),
                  });
                },
                no: () => {
                  if (i + 1 < items.length) offer(i + 1);
                  else
                    answer(`Je n'ai pas d'autre choix pour ${intent.query}. Dites un autre produit.`, {
                      pose: "loupe",
                      ok: false,
                    });
                },
              });
            };
            offer(0);
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
          if (!userRef.current) return needAccount();
          const last = lastProductRef.current;
          if (PRONOUN.test(intent.query.trim().toLowerCase())) {
            if (last) void addProduct(last);
            else answer("Quel produit ? Dites par exemple : ajoute du lait.", { pose: "ecoute", ok: false });
            return;
          }
          if (isOffline()) {
            // No catalogue to look it up in: keep the words, matched once online.
            setPose("roule");
            setPhase("working");
            earcon("drop");
            void (async () => {
              const words = asSpoken(text, intent.query);
              try {
                await api.addFreeTextToList(words);
                qc.invalidateQueries({ queryKey: ["shopping"] });
                const list = await api.getShoppingList();
                const left = list.items.filter((i) => !i.checked).length;
                answer(
                  `${words} noté. Vous avez ${left} article${left > 1 ? "s" : ""}. ` +
                    "Pas de réseau : je l'enverrai dès qu'il revient.",
                  { pose: "plein", ok: true, badge: `${left} article${left > 1 ? "s" : ""}` },
                );
              } catch {
                answer("Je n'ai pas pu le noter.", { pose: "roule", ok: false });
              }
            })();
            return;
          }
          setPose("roule");
          setPhase("working");
          earcon("drop");
          void (async () => {
            const product = await productFor(intent.query);
            if (!product) {
              answer(`Je n'ai pas trouvé ${intent.query}. Essayez un autre nom.`, { pose: "roule", ok: false });
              return;
            }
            const found = { barcode: product.barcode, name: product.name ?? intent.query };
            lastProductRef.current = found;
            await addProduct(found);
          })();
          return;
        }

        case "list-read": {
          if (!userRef.current) return needAccount();
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
              const saved = list.offline ? "Sans réseau, voici votre liste enregistrée. " : "";
              answer(
                `${saved}Votre liste contient ${left.length} article${left.length > 1 ? "s" : ""} : ${names.join(", ")}${more}.`,
                { pose: "plein", ok: true, badge: `${left.length} article${left.length > 1 ? "s" : ""}` },
              );
            } catch {
              answer("Je n'ai pas pu lire votre liste.", { pose: "roule", ok: false });
            }
          })();
          return;
        }

        case "alert-add": {
          if (!userRef.current) return needAccount();
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
          // iPhone: nothing to buy in the app (Apple's rules), so no "offer".
          speak(nativePlatform() === "ios" ? "Ces fonctions sont réservées aux abonnés Premium." : intent.say);
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
    [router, a11y, qc, runSearch, productFor, answer, addProduct, addWeekBasket, close, goodbye, needAccount, openPremium, queueTask, setOpen, stopListening],
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
    // question ("Ce prix vous convient ?") it used to vanish at once, and someone
    // who cannot hear was left with neither the price nor the question.
    // act() clears it when the next sentence arrives.
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
      if (kind === "silence") {
        // Nothing said: the conversation just stops, quietly — no error sound.
        setPhase("idle");
        return;
      }
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
      const { greeting, set: clearGreeting } = useVoiceGreeting.getState();
      clearGreeting(null);
      // What happened since the last visit comes first, said once.
      const { drops, menuWeek } = useNews.getState();
      const news = dropsSentence(drops);
      if (news) markNewsTold();
      if (menuWeek) {
        markMenuOffered();
        pendingRef.current = {
          yes: () => void addWeekBasket(menuWeek),
          no: () => answer("D'accord. Votre menu vous attend dans l'onglet Menu.", { pose: "assiette", ok: true }),
        };
      }
      const question = menuWeek
        ? MENU_READY_ASK
        : greeting || news
          ? "Que voulez-vous faire ?"
          : "Je vous écoute.";
      const text = [greeting, news, question].filter(Boolean).join(" ");
      if (news || menuWeek) {
        setResponse(text);
        setPose(menuWeek ? "assiette" : "plein");
      }
      // Listen once the greeting has been said — starting the mic earlier cut it off.
      let started = false;
      const listen = () => {
        if (started || !openRef.current) return;
        started = true;
        startListening();
      };
      speak(text, listen);
      setTimeout(listen, text.length > 30 ? 3000 + text.length * 60 : 1500);
    } else if (!open) {
      greetedRef.current = false;
    }
  }, [open, startListening, act, addWeekBasket, answer]);

  // Opened without a tap: the "Parler à Prixes" shortcut (?voice=1 — web; the
  // native app gets it through NativeSetup), or "Écouter à l'ouverture".
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
    void loadNews();
    if (fromShortcut || listenOnOpen) {
      // Give the news a moment, so the greeting can include it — never long.
      void Promise.race([loadNews(), new Promise((r) => setTimeout(r, 2500))]).finally(openWithGreeting);
    }
  }, [a11yReady, listenOnOpen]);

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
                className="relative grid h-20 w-20 place-items-center rounded-full bg-primary-container text-on-primary-container shadow-glow transition-transform active:scale-95"
              >
                {/* Listening shows in shape, not only in colour: ripples around
                    the button and bars that move, for anyone who cannot hear the
                    "bip" or read the status line. */}
                {phase === "listening" && (
                  <span aria-hidden>
                    <span className="prixes-ripple" />
                    <span className="prixes-ripple" />
                    <span className="prixes-ripple" />
                  </span>
                )}
                <Icon name={phase === "listening" ? "graphic_eq" : "mic"} fill style={{ fontSize: 40 }} className="relative" />
              </button>
              {phase === "listening" && (
                <span className="prixes-bars" aria-hidden>
                  <i /><i /><i /><i /><i />
                </span>
              )}
              <p className="text-label-lg text-on-surface-variant">{status}</p>
            </div>

            <button
              onClick={() => setConversation(!conversation)}
              role="switch"
              aria-checked={conversation}
              className="mt-4 flex w-full items-center justify-between rounded-xl border border-outline-variant/30 p-3 text-left"
            >
              <span className="flex items-center gap-2 text-label-lg text-on-surface">
                <Icon name="forum" className="text-primary" /> Conversation continue
              </span>
              <span className={`relative h-7 w-12 rounded-full transition-colors ${conversation ? "bg-primary" : "bg-surface-variant"}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${conversation ? "left-6" : "left-1"}`} />
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
