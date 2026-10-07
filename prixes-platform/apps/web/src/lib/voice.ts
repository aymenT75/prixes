// Voice engine — French speech recognition + speech synthesis, plus a small intent
// parser so the assistant feels like Siri/Google Assistant. On the web it uses the
// Web Speech API; inside the Capacitor native shell (where WKWebView has no
// SpeechRecognition) it uses native plugins for STT, TTS and haptics.

// Web Speech API types are declared in web-speech-api.d.ts
import { isNativeApp } from "./platform";
import type { FuelId, VoiceTask } from "./voiceTasks";

export type Intent =
  | { type: "navigate"; path: string; say: string }
  | { type: "search"; query: string; say: string }
  | { type: "setting"; action: "dark" | "light" | "bigger" | "smaller" | "contrast"; say: string }
  | { type: "read"; say: string }
  | { type: "help"; say: string }
  // A job a page does on arrival (fuel search, nearby stores, best store…).
  | { type: "task"; task: VoiceTask; path: string; say: string }
  | { type: "list-add"; query: string; say: string }
  | { type: "list-read"; say: string }
  | { type: "alert-add"; query: string; say: string }
  | { type: "premium"; say: string }
  // Answers to the assistant's own question ("Je l'ajoute à votre liste ?").
  | { type: "confirm"; say: string }
  | { type: "cancel"; say: string }
  | { type: "bye"; say: string }
  | { type: "news"; say: string }
  | { type: "unknown"; say: string };

export function speechSupported(): boolean {
  if (isNativeApp()) return true; // native @capacitor-community/speech-recognition
  if (typeof window === "undefined") return false;
  const win = window as any;
  return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
}

export function ttsSupported(): boolean {
  if (isNativeApp()) return true; // native @capacitor-community/text-to-speech
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function createRecognizer(): any {
  if (typeof window === "undefined") return null;
  const win = window as any;
  const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "fr-FR";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  return rec;
}

// Unified recognizer used by the voice assistant so the UI is platform-agnostic:
// callbacks are assigned, then start()/stop() are called. Backed by the Web Speech
// API on the web and by @capacitor-community/speech-recognition in the native shell.
export interface VoiceRecognizer {
  start(): void;
  stop(): void;
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  /** "silence": nothing was said — ends a conversation quietly, not an error. */
  onError?: (kind: "not-allowed" | "silence" | "other") => void;
  onEnd?: () => void;
}

export function createVoiceRecognizer(): VoiceRecognizer | null {
  return isNativeApp() ? nativeRecognizer() : webRecognizer();
}

function webRecognizer(): VoiceRecognizer | null {
  const rec = createRecognizer();
  if (!rec) return null;
  const r: VoiceRecognizer = {
    start() {
      try {
        rec.start();
      } catch {
        /* already started */
      }
    },
    stop() {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
  };
  rec.onresult = (e: any) => {
    let txt = "";
    for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
    r.onPartial?.(txt);
    if (e.results[e.results.length - 1].isFinal) r.onFinal?.(txt);
  };
  rec.onerror = (e: any) =>
    r.onError?.(
      e.error === "not-allowed" ? "not-allowed" : e.error === "no-speech" || e.error === "aborted" ? "silence" : "other",
    );
  rec.onend = () => r.onEnd?.();
  return r;
}

function nativeRecognizer(): VoiceRecognizer {
  let partialHandle: { remove: () => void } | undefined;
  let stateHandle: { remove: () => void } | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastText = "";

  async function cleanup() {
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = undefined;
    try {
      partialHandle?.remove();
    } catch {
      /* ignore */
    }
    try {
      stateHandle?.remove();
    } catch {
      /* ignore */
    }
    partialHandle = undefined;
    stateHandle = undefined;
  }

  let finalized = false;

  // Fire onFinal exactly once, then tear everything down. Called when the recognizer
  // reports it stopped (plus a short grace, see below) or when the caller stops it.
  async function finalize() {
    if (finalized) return;
    finalized = true;
    const text = lastText;
    await cleanup();
    if (text) r.onFinal?.(text);
    r.onEnd?.();
  }

  const r: VoiceRecognizer = {
    start() {
      lastText = "";
      finalized = false;
      (async () => {
        try {
          const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
          const perm = await SpeechRecognition.checkPermissions().catch(() => null);
          if (!perm || perm.speechRecognition !== "granted") {
            const req = await SpeechRecognition.requestPermissions().catch(() => null);
            if (!req || req.speechRecognition !== "granted") {
              r.onError?.("not-allowed");
              r.onEnd?.();
              return;
            }
          }

          // With partialResults: true this plugin resolves start() IMMEDIATELY and
          // delivers every result — including the final one — through the listener.
          // So the listener must stay alive for the whole utterance: the old code read
          // start()'s (empty) return and tore the listener down at once, which is why a
          // recognised "nutella" reached a removed listener and no search ever ran.
          partialHandle = await SpeechRecognition.addListener(
            "partialResults",
            (data: { matches?: string[] }) => {
              const txt: string = data?.matches?.[0] ?? "";
              if (txt) {
                lastText = txt;
                r.onPartial?.(txt);
              }
            }
          );

          // The recogniser signals it stopped BEFORE the last partialResults arrives
          // (~0.5s earlier, observed on-device), so don't finalise on "stopped"
          // immediately — wait a short grace for the trailing final result, then commit.
          stateHandle = await SpeechRecognition.addListener(
            "listeningState",
            (data: { status?: string }) => {
              if (data?.status === "stopped") {
                if (graceTimer) clearTimeout(graceTimer);
                graceTimer = setTimeout(() => void finalize(), 700);
              }
            }
          );

          await SpeechRecognition.start({
            language: "fr-FR",
            maxResults: 1,
            partialResults: true,
            popup: false,
          });
          // Safety net: if "stopped" never arrives (some devices), finalise anyway so
          // the mic can't hang open forever.
          if (!graceTimer && !finalized) {
            graceTimer = setTimeout(() => void finalize(), 8000);
          }
        } catch {
          r.onError?.("other");
          await cleanup();
          r.onEnd?.();
        }
      })();
    },
    stop() {
      (async () => {
        try {
          const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
          await SpeechRecognition.stop();
        } catch {
          /* ignore */
        }
        // Give the final partialResults the same grace before committing.
        if (!finalized) {
          if (graceTimer) clearTimeout(graceTimer);
          graceTimer = setTimeout(() => void finalize(), 700);
        }
      })();
    },
  };
  return r;
}

let _frVoice: any = null;
function pickFrenchVoice(): any {
  if (!ttsSupported()) return null;
  if (_frVoice) return _frVoice;
  const voices = window.speechSynthesis.getVoices();
  const fr = voices.filter((v) => v.lang?.toLowerCase().startsWith("fr"));
  // Prefer modern neural voices (Edge/Chrome ship free "Natural"/"Online" French
  // voices that sound far less robotic than the legacy default) before falling back.
  const isNeural = (v: any) =>
    /natural|online|neural|enhanced|premium/i.test(v.name);
  _frVoice =
    fr.find((v) => /fr[-_]FR/i.test(v.lang) && isNeural(v)) ||
    fr.find(isNeural) ||
    fr.find((v) => /fr[-_]FR/i.test(v.lang)) ||
    fr[0] ||
    null;
  return _frVoice;
}

// Natural (OpenAI) TTS is opt-in and configured at runtime from `/meta` + the user's
// "voix naturelle" setting. When off (or offline, or on a safety-critical utterance)
// we use instant on-device / browser speech synthesis instead.
let _naturalTts = false;
let _ttsVoice: string | undefined;
export function setNaturalTts(enabled: boolean, voice?: string): void {
  _naturalTts = enabled;
  _ttsVoice = voice;
}

let _audio: HTMLAudioElement | null = null;

export interface SpeakOpts {
  // Force instant on-device speech (never the network TTS). Use for safety-critical
  // announcements (allergen warnings) that must not wait on a round-trip.
  instant?: boolean;
}

export function speak(text: string, onEnd?: () => void, opts?: SpeakOpts): void {
  const useNatural =
    _naturalTts &&
    !opts?.instant &&
    !isNativeApp() &&
    typeof navigator !== "undefined" &&
    navigator.onLine !== false;

  if (useNatural) {
    // Try the natural voice; fall back to on-device TTS on any failure.
    void speakNatural(text, onEnd).catch(() => speakLocal(text, onEnd));
    return;
  }
  speakLocal(text, onEnd);
}

async function speakNatural(text: string, onEnd?: () => void): Promise<void> {
  const { api } = await import("./api");
  const url = await api.ttsAudioUrl(text, _ttsVoice);
  if (!url) {
    speakLocal(text, onEnd);
    return;
  }
  stopSpeaking();
  const audio = new Audio(url);
  _audio = audio;
  const done = () => {
    URL.revokeObjectURL(url);
    if (_audio === audio) _audio = null;
    onEnd?.();
  };
  audio.onended = done;
  audio.onerror = () => {
    URL.revokeObjectURL(url);
    if (_audio === audio) _audio = null;
    speakLocal(text, onEnd);
  };
  await audio.play().catch(() => {
    // Autoplay blocked or decode error → on-device fallback.
    URL.revokeObjectURL(url);
    if (_audio === audio) _audio = null;
    speakLocal(text, onEnd);
  });
}

function speakLocal(text: string, onEnd?: () => void): void {
  if (isNativeApp()) {
    (async () => {
      try {
        const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
        await TextToSpeech.stop().catch(() => {});
        await TextToSpeech.speak({ text, lang: "fr-FR", rate: 1.0, pitch: 1.0 });
      } catch {
        /* TTS unavailable */
      }
      onEnd?.();
    })();
    return;
  }
  if (!ttsSupported()) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR";
  const v = pickFrenchVoice();
  if (v) u.voice = v;
  u.rate = 0.98;
  u.pitch = 1;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (_audio) {
    _audio.pause();
    _audio = null;
  }
  if (isNativeApp()) {
    import("@capacitor-community/text-to-speech")
      .then(({ TextToSpeech }) => TextToSpeech.stop().catch(() => {}))
      .catch(() => {});
    return;
  }
  if (ttsSupported()) window.speechSynthesis.cancel();
}

/**
 * Preload the French TTS voice so the first spoken response has no cold-start
 * delay (Web Speech loads voices asynchronously). Call once at app start.
 */
export function warmUpVoice(): void {
  if (isNativeApp() || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  pickFrenchVoice();
  window.speechSynthesis.addEventListener?.("voiceschanged", () => pickFrenchVoice());
}

/**
 * Semantic haptics so a user never has to look at the screen (WCAG-friendly):
 *  - success  = one long buzz (confirmation),
 *  - danger   = staccato buzzes (allergen / warning).
 * No-ops where unsupported.
 */
export function hapticSuccess(): void {
  if (isNativeApp()) {
    import("@capacitor/haptics")
      .then(({ Haptics, NotificationType }) =>
        Haptics.notification({ type: NotificationType.Success }).catch(() => {}),
      )
      .catch(() => {});
    return;
  }
  try {
    navigator.vibrate?.(400);
  } catch {
    /* ignore */
  }
}

export function hapticDanger(): void {
  if (isNativeApp()) {
    import("@capacitor/haptics")
      .then(({ Haptics, NotificationType }) =>
        Haptics.notification({ type: NotificationType.Error }).catch(() => {}),
      )
      .catch(() => {});
    return;
  }
  try {
    navigator.vibrate?.([120, 60, 120, 60, 120]);
  } catch {
    /* ignore */
  }
}

/** Haptic feedback (no-op where unsupported, e.g. desktop / iOS Safari). */
export function vibrate(pattern: number | number[]): void {
  if (isNativeApp()) {
    (async () => {
      try {
        const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
        if (Array.isArray(pattern)) {
          // Multi-pulse patterns are used for warnings (e.g. allergen alerts).
          await Haptics.notification({ type: NotificationType.Warning });
        } else if (pattern >= 100) {
          await Haptics.vibrate({ duration: pattern });
        } else {
          await Haptics.impact({ style: ImpactStyle.Light });
        }
      } catch {
        /* haptics unavailable */
      }
    })();
    return;
  }
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

function strip(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove accents
    .trim();
}

// Order matters: NAV returns the first keyword hit, so the specific pages (list,
// alerts) sit BEFORE the broad "/courses" — otherwise "liste de courses" would
// match "course" and open Courses instead of the shopping list. Stores, fuel and
// the scanner are not here: they are tasks (see parseIntent), not just pages.
const NAV = [
  { path: "/", say: "J'ouvre l'accueil.", words: ["accueil", "maison", "page d'accueil", "menu principal"] },
  { path: "/menu", say: "J'ouvre votre menu de la semaine.", words: ["menu de la semaine", "mes menus", "mon menu", "menu", "repas de la semaine"] },
  { path: "/list", say: "J'ouvre votre liste.", words: ["ma liste", "liste de course", "liste de courses", "panier", "ma course", "liste"] },
  { path: "/alerts", say: "J'ouvre vos alertes.", words: ["alerte", "alertes", "baisse de prix", "notification"] },
  { path: "/feedback", say: "J'ouvre la page pour donner votre avis.", words: ["avis", "signaler", "probleme", "suggestion"] },
  { path: "/account", say: "J'ouvre votre compte.", words: ["compte", "profil", "mon compte", "parametre", "reglage"] },
  { path: "/courses", say: "J'ouvre les courses.", words: ["course", "produit", "epicerie", "aliment"] },
];

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

const FUEL_LABEL: Record<FuelId, string> = {
  gazole: "gazole",
  sp95: "SP95",
  sp98: "SP98",
  e85: "E85",
  gplc: "GPL",
};

/** The fuel a phrase names, or null when it does not talk about fuel at all. */
export function fuelIn(t: string): FuelId | null {
  if (/\b(e ?85|ethanol|superethanol|bioethanol)\b/.test(t)) return "e85";
  if (/\b(gpl|gplc)\b/.test(t)) return "gplc";
  if (/\b(sp ?98|98)\b/.test(t)) return "sp98";
  if (/\b(sp ?95|95|sans plomb|sans-plomb|e10)\b/.test(t)) return "sp95";
  if (/\b(gazole|gasoil|gas-oil|diesel)\b/.test(t)) return "gazole";
  if (/\b(essence)\b/.test(t)) return "sp95";
  if (/\b(carburant|station|stations|plein|pompe)\b/.test(t)) return "gazole";
  return null;
}

const HELP_TEXT =
  "Je peux tout faire à la voix. Par exemple : une raclette pour 6, ajoute du lait à ma liste, " +
  "lis ma liste, où faire mes courses, essence la moins chère, magasins proches, " +
  "compose mon menu, change le repas de mardi, scanne un produit, alerte sur le café. " +
  "Je peux aussi agrandir le texte, activer le mode sombre et lire la page.";

/** Drop the article in front of a product name: "du lait" → "lait". */
function bare(q: string): string {
  return q.replace(/^(l'|la |le |les |du |de la |de l'|des |d'|un |une |mon |ma |mes )/, "").trim();
}

export function parseIntent(raw: string): Intent {
  const t = strip(raw);
  if (!t) return { type: "unknown", say: "Je n'ai pas entendu. Pouvez-vous répéter ?" };

  // Help
  if (/\b(aide|aidez|que peux|qu'est-ce que tu|fonctionne|aider|que sais-tu)\b/.test(t)) {
    return { type: "help", say: HELP_TEXT };
  }

  // In the shop: the guide reads the list aisle by aisle, hands free.
  if (/\b(guide[- ]?moi|guidez[- ]moi|guide moi|je suis (au|en|dans le) magasin|lance le guid|commence les courses)\b/.test(t)) {
    return { type: "task", task: { kind: "guide" }, path: "/list", say: "Je vous guide dans le magasin." };
  }

  // A yes / no to the assistant's last question — and "ajoute-le", which means
  // "the product you just told me about". Before list-add, which would read
  // "ajoute-le" as a product called "le".
  // What changed: the list's price drops, a Sunday menu waiting.
  if (/\b(quoi de neuf|des nouvelles|qu'?est[- ]ce qui a (baisse|change)|ce qui a baisse|les baisses|qu'?est[- ]ce qui est moins cher)\b/.test(t)) {
    return { type: "news", say: "" };
  }
  // Ends a conversation: the mic stops reopening.
  if (/^(merci|merci beaucoup|merci bien|c'est tout|ce sera tout|ca ira|au revoir|a bientot|bonne journee|bonne soiree|c'est bon merci|fini|termine|j'ai fini)\b/.test(t)) {
    return { type: "bye", say: "Avec plaisir. À bientôt." };
  }
  if (/^(oui|ouais|d'accord|ok|okay|vas-y|vas y|allez|volontiers|je veux bien|bien sur|c'est ca|parfait|oui merci)\b/.test(t) ||
      /\b(ajoute-le|ajoute le|ajoute-la|ajoute la|ajoute-les|ajoute les|mets-le|mets le|mets-les|garde-le|garde les)\s*$/.test(t)) {
    return { type: "confirm", say: "" };
  }
  if (/^(non|non merci|annule|laisse|laisse tomber|pas maintenant|stop|arrete)\b/.test(t)) {
    return { type: "cancel", say: "D'accord." };
  }

  // Shopping list — before "read", which would otherwise take "lis ma liste".
  if (/\b(lis|lire|dis-moi|dis moi|qu'y a-t-il|que contient|qu'est-ce qu'il y a|rappelle)\b.*\bliste\b/.test(t)) {
    return { type: "list-read", say: "" };
  }
  // "ajoute-le à ma liste": the product just talked about — the assistant knows it.
  const pron = t.match(/\b(?:ajoute|rajoute|mets|met)[-\s]+(le|la|les|ca|cela)(?:\s+(?:a|dans|sur)\s+(?:ma|la|mes)\s+(?:liste|courses))?\s*$/);
  if (pron) return { type: "list-add", query: pron[1], say: "" };
  const add =
    t.match(/\b(?:ajoute|ajouter|rajoute|mets|met|note|noter)\s+(.+?)\s+(?:a|dans|sur)\s+(?:ma|la|mes)\s+(?:liste|courses)\b/) ??
    t.match(/\b(?:ajoute|ajouter|rajoute|note)\s+(.+)$/);
  if (add && bare(add[1]).length > 1) {
    const q = bare(add[1]);
    return { type: "list-add", query: q, say: `J'ajoute ${q} à votre liste.` };
  }

  // Settings
  if (/\b(mode sombre|sombre|nuit)\b/.test(t)) return { type: "setting", action: "dark", say: "Thème Nuit activé." };
  if (/\b(mode clair|clair)\b/.test(t)) return { type: "setting", action: "light", say: "Thème Jour activé." };
  // \b(agrandi)\b alone would miss "agrandis" ("tu" imperative, e.g. the
  // "Agrandis le texte" example command) — \b requires a boundary right after
  // "agrandi", but the following "s" is a word char, so no boundary there.
  // List the inflected forms explicitly instead of relying on the stem alone.
  if (/\b(agrandi|agrandis|agrandir|plus grand|grossir|grand texte|grosse ecriture|augmente)\b/.test(t))
    return { type: "setting", action: "bigger", say: "J'agrandis le texte." };
  if (/\b(reduire|reduis|reduit|plus petit|diminue|petit texte)\b/.test(t))
    return { type: "setting", action: "smaller", say: "Je réduis le texte." };
  if (/\b(contraste)\b/.test(t)) return { type: "setting", action: "contrast", say: "Je change le contraste." };

  // Read the page aloud — also covers allergen questions on a product page.
  if (
    /\b(lis|lire|lit|lecture|qu'y a|qu'est-ce qu'il y a|raconte|allergen|allergie|contient|gluten|arachide|lactose)\b/.test(
      t,
    )
  )
    return { type: "read", say: "" };

  if (/\b(premium|abonnement|abonner|m'abonner)\b/.test(t)) {
    return { type: "premium", say: "Voici l'offre Premium." };
  }

  // A price alert on a product: "alerte sur le café", "préviens-moi si le beurre baisse".
  const alert =
    t.match(/\balertes?\s+(?:sur|pour|quand|si)\s+(.+)/) ??
    t.match(/\bpreviens?-?\s?moi\s+(?:quand|si)\s+(.+?)\s+(?:baisse|est moins cher|diminue)/);
  if (alert && bare(alert[1]).length > 1) {
    const q = bare(alert[1]);
    return { type: "alert-add", query: q, say: `Je crée une alerte sur ${q}.` };
  }

  // Where to shop the list — before "stores", which also talks about shops.
  if (
    /\b(ou (faire|acheter) (mes|les|ma|mon) (courses|liste|panier)|magasin le (moins cher|plus economique)|meilleur magasin|moins cher pour (ma|la|mes) (liste|courses)|organise (mes|les|ma) (courses|liste)|ou aller faire)\b/.test(
      t,
    )
  ) {
    return { type: "task", task: { kind: "split" }, path: "/list", say: "Je compare les magasins pour votre liste." };
  }

  // Weekly menu: swap one meal, or compose the week.
  const dayIndex = DAYS.findIndex((d) => t.includes(d));
  if (/\b(change|changer|remplace|remplacer|autre)\b/.test(t) && /\b(repas|plat|diner|dejeuner|menu)\b/.test(t) && dayIndex >= 0) {
    return {
      type: "task",
      task: { kind: "menu-swap", day: dayIndex },
      path: "/menu",
      say: `Je change le repas de ${DAYS[dayIndex]}.`,
    };
  }
  if (
    /\b(compose|composer|prepare|preparer|fais|faire|refais|refaire|genere|cree|planifie|propose)\b.*\b(menu|menus|repas|semaine)\b/.test(t) ||
    /\b(idees? de repas|quoi manger|qu'est-ce qu'on mange|on mange quoi)\b/.test(t)
  ) {
    return { type: "task", task: { kind: "menu-compose" }, path: "/menu", say: "Je compose votre semaine." };
  }

  // A dish or a recipe: the assistant turns it into a costed list.
  if (
    /\b(ingredients?|recette)\b/.test(t) ||
    /\b(pour (faire|preparer|cuisiner)|je (fais|prepare|cuisine|veux faire|voudrais faire))\b/.test(t) ||
    /\b(un|une|des|du)\s+[a-z' -]{3,40}\s+pour\s+\d{1,2}\b/.test(t)
  ) {
    return { type: "task", task: { kind: "cart", prompt: raw.trim() }, path: "/list", say: "Je prépare la liste." };
  }

  // Fuel: open the fuel page on the right fuel, find the cheapest around.
  const fuel = fuelIn(t);
  if (fuel) {
    return {
      type: "task",
      task: { kind: "fuel", fuel },
      path: "/fuel",
      say: `Je cherche le ${FUEL_LABEL[fuel]} le moins cher près de vous.`,
    };
  }

  // Nearby shops.
  if (/\b(magasins?|supermarches?|superettes?|boutiques?|hypermarches?|epiceries? proche)\b/.test(t)) {
    return { type: "task", task: { kind: "stores" }, path: "/stores", say: "Je cherche les magasins autour de vous." };
  }

  // The barcode scanner is gone: say so and point to what replaces it.
  if (/\b(scanne|scanner|scan|code barre|code-barre|code-barres|codes barres)\b/.test(t)) {
    return {
      type: "task",
      task: { kind: "stores" },
      path: "/stores",
      say: "Le scanner n'existe plus : dites-moi plutôt le produit. Voici les magasins autour de vous.",
    };
  }

  // Navigation by keyword — checked before the generic search phrase below so
  // that "mon menu" routes to /menu instead of becoming a literal search.
  for (const n of NAV) {
    if (n.words.some((w) => t.includes(w))) {
      return { type: "navigate", path: n.path, say: n.say };
    }
  }

  // Search: "cherche X", "trouve X", "recherche X", "je veux X", "prix du X"
  const m = t.match(/\b(?:cherche|chercher|trouve|trouver|recherche|rechercher|je veux|je cherche|prix d[eu]s?|combien coute|trouvez)\s+(.*)/);
  if (m && m[1]) {
    const q = bare(m[1]);
    if (q.length > 1) return { type: "search", query: q, say: `Je cherche ${q}.` };
  }

  // Fallback: treat the whole phrase as a product search.
  if (t.length > 2) return { type: "search", query: t, say: `Je cherche ${t}.` };
  return { type: "unknown", say: "Je n'ai pas compris. Dites « aide » pour les commandes." };
}

/** Read the visible main content aloud (headings + meaningful text). */
export function readPageAloud(): string {
  if (typeof document === "undefined") return "";
  const main = document.querySelector("main");
  if (!main) return "";
  const parts: string[] = [];
  main.querySelectorAll("h1,h2,h3,article,p,[data-speak]").forEach((el) => {
    // Icons are ligatures: their text is "arrow_downward", "trending_up"… which a
    // blind user heard read aloud. Read a copy without the icons and hidden bits.
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll(".material-symbols-outlined,[aria-hidden='true']").forEach((n) => n.remove());
    const txt = copy.textContent?.replace(/\s+/g, " ").trim();
    if (txt && txt.length > 1 && !parts.includes(txt)) parts.push(txt);
  });
  // No emoji read out ("main qui salue"), no ".." where a line already ends a sentence.
  return parts
    .slice(0, 30)
    .map((p) => p.replace(/\p{Extended_Pictographic}/gu, "").trim().replace(/[.…]$/, ""))
    .filter(Boolean)
    .join(". ")
    .replace(/([?!])\./g, "$1");
}
