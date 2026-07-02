// Voice engine — French speech recognition (Web Speech API) + speech synthesis,
// plus a small intent parser so the assistant feels like Siri/Google Assistant.

export type Intent =
  | { type: "navigate"; path: string; say: string }
  | { type: "search"; query: string; say: string }
  | { type: "setting"; action: "dark" | "light" | "bigger" | "smaller" | "contrast"; say: string }
  | { type: "read"; say: string }
  | { type: "help"; say: string }
  | { type: "unknown"; say: string };

export function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function ttsSupported(): boolean {
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

let _frVoice: SpeechSynthesisVoice | null = null;
function pickFrenchVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  if (_frVoice) return _frVoice;
  const voices = window.speechSynthesis.getVoices();
  _frVoice =
    voices.find((v) => /fr[-_]FR/i.test(v.lang)) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith("fr")) ||
    null;
  return _frVoice;
}

export function speak(text: string, onEnd?: () => void): void {
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
  if (ttsSupported()) window.speechSynthesis.cancel();
}

/** Haptic feedback (no-op where unsupported, e.g. desktop / iOS Safari). */
export function vibrate(pattern: number | number[]): void {
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
