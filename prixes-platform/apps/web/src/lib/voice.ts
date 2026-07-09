// Voice engine — French speech recognition + speech synthesis, plus a small intent
// parser so the assistant feels like Siri/Google Assistant. On the web it uses the
// Web Speech API; inside the Capacitor native shell (where WKWebView has no
// SpeechRecognition) it uses native plugins for STT, TTS and haptics.
import { isNativeApp } from "./platform";

export type Intent =
  | { type: "navigate"; path: string; say: string }
  | { type: "search"; query: string; say: string }
  | { type: "setting"; action: "dark" | "light" | "bigger" | "smaller" | "contrast"; say: string }
  | { type: "read"; say: string }
  | { type: "help"; say: string }
  | { type: "unknown"; say: string };

export function speechSupported(): boolean {
  if (isNativeApp()) return true; // native @capacitor-community/speech-recognition
  if (typeof window === "undefined") return false;
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function ttsSupported(): boolean {
  if (isNativeApp()) return true; // native @capacitor-community/text-to-speech
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function createRecognizer(): any | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
  onError?: (kind: "not-allowed" | "other") => void;
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
  rec.onerror = (e: any) => r.onError?.(e?.error === "not-allowed" ? "not-allowed" : "other");
  rec.onend = () => r.onEnd?.();
  return r;
}

function nativeRecognizer(): VoiceRecognizer {
  let partialHandle: { remove: () => void } | undefined;
  let lastText = "";

  async function cleanup() {
    try {
      partialHandle?.remove();
    } catch {
      /* ignore */
    }
    partialHandle = undefined;
  }

  const r: VoiceRecognizer = {
    start() {
      lastText = "";
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
          // Live transcript via partial results (used for the on-screen text).
          partialHandle = await SpeechRecognition.addListener("partialResults", (data: any) => {
            const txt: string = data?.matches?.[0] ?? "";
            if (txt) {
              lastText = txt;
              r.onPartial?.(txt);
            }
          });
          const res: any = await SpeechRecognition.start({
            language: "fr-FR",
            maxResults: 1,
            partialResults: true,
            popup: false,
          });
          // Android resolves start() with the final matches; iOS delivers via listener.
          const finalText: string = res?.matches?.[0] ?? lastText;
          if (finalText) r.onFinal?.(finalText);
        } catch {
          r.onError?.("other");
        } finally {
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
        await cleanup();
      })();
    },
  };
  return r;
}

let _frVoice: SpeechSynthesisVoice | null = null;
function pickFrenchVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  if (_frVoice) return _frVoice;
  const voices = window.speechSynthesis.getVoices();
  const fr = voices.filter((v) => v.lang?.toLowerCase().startsWith("fr"));
  // Prefer modern neural voices (Edge/Chrome ship free "Natural"/"Online" French
  // voices that sound far less robotic than the legacy default) before falling back.
  const isNeural = (v: SpeechSynthesisVoice) =>
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

const NAV = [
  { path: "/", say: "J'ouvre l'accueil.", words: ["accueil", "maison", "page d'accueil", "menu principal"] },
  { path: "/courses", say: "J'ouvre les courses.", words: ["course", "produit", "epicerie", "supermarche", "aliment"] },
  { path: "/fuel", say: "J'ouvre les carburants.", words: ["carburant", "essence", "gazole", "diesel", "station", "gasoil", "sp95", "sp98"] },
  { path: "/deals", say: "J'ouvre les bons plans.", words: ["promo", "deal", "bon plan", "offre", "reduction", "soldes"] },
  { path: "/scanner", say: "J'ouvre le scanner.", words: ["scan", "scanner", "code barre", "code-barres"] },
  { path: "/account", say: "J'ouvre votre compte.", words: ["compte", "profil", "mon compte", "parametre", "reglage"] },
];

const HELP_TEXT =
  "Vous pouvez me demander d'ouvrir l'accueil, les courses, les carburants ou les bons plans. " +
  "Dites par exemple : cherche du lait. Ou : trouve l'essence la moins chère. " +
  "Je peux aussi agrandir le texte, activer le mode sombre ou le fort contraste, et lire la page.";

export function parseIntent(raw: string): Intent {
  const t = strip(raw);
  if (!t) return { type: "unknown", say: "Je n'ai pas entendu. Pouvez-vous répéter ?" };

  // Help
  if (/\b(aide|aidez|que peux|qu'est-ce que tu|comment|fonctionne|aider)\b/.test(t)) {
    return { type: "help", say: HELP_TEXT };
  }

  // Settings
  if (/\b(mode sombre|sombre|nuit|noir)\b/.test(t)) return { type: "setting", action: "dark", say: "Mode sombre activé." };
  if (/\b(mode clair|clair|jour|blanc)\b/.test(t)) return { type: "setting", action: "light", say: "Mode clair activé." };
  if (/\b(agrandi|agrandir|plus grand|grossir|grand texte|grosse ecriture|augmente)\b/.test(t))
    return { type: "setting", action: "bigger", say: "J'agrandis le texte." };
  if (/\b(reduire|plus petit|diminue|petit texte|reduit)\b/.test(t))
    return { type: "setting", action: "smaller", say: "Je réduis le texte." };
  if (/\b(contraste)\b/.test(t)) return { type: "setting", action: "contrast", say: "Je change le contraste." };

  // Read the page aloud — also covers allergen questions on a product page.
  if (
    /\b(lis|lire|lit|lecture|qu'y a|qu'est-ce qu'il y a|raconte|allergen|allergie|contient|gluten|arachide|lactose)\b/.test(
      t,
    )
  )
    return { type: "read", say: "" };

  // Search: "cherche X", "trouve X", "recherche X", "je veux X", "prix du X"
  const m = t.match(/\b(?:cherche|chercher|trouve|trouver|recherche|rechercher|je veux|je cherche|prix d[eu]s?|combien coute|trouvez)\s+(.*)/);
  if (m && m[1]) {
    // If they said "trouve l'essence", treat as fuel navigation.
    const q = m[1].replace(/^(l'|la |le |les |du |de la |des |un |une )/, "").trim();
    const fuelNav = NAV.find((n) => n.path === "/fuel");
    if (fuelNav && fuelNav.words.some((w) => q.includes(w))) {
      return { type: "navigate", path: "/fuel", say: fuelNav.say };
    }
    if (q.length > 1) return { type: "search", query: q, say: `Je cherche ${q}.` };
  }

  // Navigation by keyword
  for (const n of NAV) {
    if (n.words.some((w) => t.includes(w))) {
      return { type: "navigate", path: n.path, say: n.say };
    }
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
    const txt = (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim();
    if (txt && txt.length > 1 && !parts.includes(txt)) parts.push(txt);
  });
  return parts.slice(0, 30).join(". ");
}
