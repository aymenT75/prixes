// Persistance locale : progression, points, niveaux adaptatifs, diagnostic.
import { defaultProgress } from "./srs.js";

const KEY = "ihsan.state.v1";

// Niveaux d'apprentissage adaptatif
export const LEVELS = {
  BEGINNER: "beginner",    // 0-200 reps : mots isolés + phrases courtes
  INTERMEDIATE: "intermediate", // 200-600 reps : versets entiers
  ADVANCED: "advanced",    // 600-1000 reps : versets longs + rythmes rapides
};

function freshState() {
  return {
    // Progression et points
    progress: {},
    totalPoints: 0,
    totalRepetitions: 0,   // TOUS les essais (réussis + échecs)
    streak: { days: 0, best: 0, lastDate: null },

    // Récitateur et niveaux
    reciterId: "al_husary_muallim",
    level: LEVELS.BEGINNER,           // niveau courant
    diagnosticDone: false,             // test de placement fait ?

    // Onboarding
    childName: "",
    onboardingDone: false,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...freshState(), ...JSON.parse(raw) };
  } catch (_) {}
  return freshState();
}

let state = load();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
}

// ---- Progression ----
export function getProgress(letterId) {
  return state.progress[letterId] || defaultProgress(letterId);
}
export function setProgress(letterId, progress) {
  state.progress[letterId] = progress;
  persist();
}

// ---- Points & Répétitions ----
export function getTotalPoints() { return state.totalPoints; }
export function addPoints(n) { state.totalPoints += n; persist(); return state.totalPoints; }

export function getTotalRepetitions() { return state.totalRepetitions; }
export function recordRepetition() { state.totalRepetitions += 1; persist(); return state.totalRepetitions; }

// ---- Série ----
function dayKey(d) { return d.toISOString().slice(0, 10); }
export function getStreak() { return { ...state.streak }; }
export function recordPracticeDay(now = new Date()) {
  const today = dayKey(now);
  const last = state.streak.lastDate;
  if (last === today) return state.streak.days;
  const yesterday = dayKey(new Date(now.getTime() - 86400000));
  state.streak.days = last === yesterday ? state.streak.days + 1 : 1;
  state.streak.best = Math.max(state.streak.best, state.streak.days);
  state.streak.lastDate = today;
  persist();
  return state.streak.days;
}

// ---- Récitateur ----
export function getReciterId() { return state.reciterId || "al_husary_muallim"; }
export function setReciterId(id) { state.reciterId = id; persist(); }

// ---- Niveaux adaptatifs ----
export function getLevel() { return state.level || LEVELS.BEGINNER; }
export function setLevel(level) { state.level = level; persist(); }

// Détermine le niveau selon les reps totales
export function computeLevel() {
  const reps = state.totalRepetitions;
  if (reps < 200) return LEVELS.BEGINNER;
  if (reps < 600) return LEVELS.INTERMEDIATE;
  return LEVELS.ADVANCED;
}

// ---- Diagnostic ----
export function isDiagnosticDone() { return state.diagnosticDone; }
export function completeDiagnostic(level) { state.level = level; state.diagnosticDone = true; persist(); }

// ---- Onboarding ----
export function isOnboardingDone() { return state.onboardingDone; }
export function getChildName() { return state.childName || ""; }
export function completeOnboarding(name) { state.childName = name; state.onboardingDone = true; persist(); }

export function resetAll() { state = freshState(); persist(); }
