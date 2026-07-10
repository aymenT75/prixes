// Adaptation du contenu par niveau d'apprentissage.
// BEGINNER: mots isolés | INTERMEDIATE: phrases | ADVANCED: versets complets

import { LEVELS } from "./store.js";
import { breakVerseIntoWords, breakVerseIntoPhrases, getGranules } from "./wordBreaker.js";

export const LEVEL_CONFIG = {
  [LEVELS.BEGINNER]: {
    name: "🟢 Débutant (0-200 reps)",
    granuleType: "word",        // Apprentissage mot par mot
    granuleCount: 1,            // 1 mot à la fois
    description: "Apprends chaque mot individuellement avec le tarteel.",
    audioSpeed: 0.75,           // Audio ralenti (75% de la vitesse normale)
    targetAccuracy: 85,         // 85% de précision pour réussir
    repetitionsToMastery: 5,    // 5 révisions pour maîtriser un mot
  },
  [LEVELS.INTERMEDIATE]: {
    name: "🟡 Intermédiaire (200-600 reps)",
    granuleType: "phrase",      // Phrases (groupes de mots)
    granuleCount: 3,            // 3 mots par phrase
    description: "Maîtrise les phrases du verset avec le tarteel naturel.",
    audioSpeed: 0.9,            // Audio légèrement ralenti (90%)
    targetAccuracy: 90,         // 90% de précision
    repetitionsToMastery: 3,    // 3 révisions pour maîtriser une phrase
  },
  [LEVELS.ADVANCED]: {
    name: "🔴 Avancé (600-1000 reps)",
    granuleType: "verse",       // Versets complets
    granuleCount: 1,            // Verset entier
    description: "Maîtrise le verset complet avec le tarteel naturel et rythmes rapides.",
    audioSpeed: 1.0,            // Vitesse normale (100%)
    targetAccuracy: 95,         // 95% de précision
    repetitionsToMastery: 2,    // 2 révisions pour maîtriser un verset
  },
};

export function getLevelConfig(level) {
  return LEVEL_CONFIG[level] || LEVEL_CONFIG[LEVELS.BEGINNER];
}

export function getGranulesForLevel(verse, level) {
  // Retourne les granules appropriées au niveau.
  const config = getLevelConfig(level);
  const granules = getGranules(verse, config.granuleType);

  // Limite le nombre de granules visibles selon le niveau.
  return granules.slice(0, Math.max(1, config.granuleCount));
}

export function getAudioSpeedForLevel(level) {
  // Retourne la vitesse audio appropriée au niveau.
  const config = getLevelConfig(level);
  return config.audioSpeed;
}

export function getTargetAccuracyForLevel(level) {
  // Retourne la cible de précision pour réussir au niveau.
  const config = getLevelConfig(level);
  return config.targetAccuracy;
}

export function getRepetitionsTillMasteryForLevel(level) {
  // Nombre de révisions nécessaires pour maîtriser une granule au niveau.
  const config = getLevelConfig(level);
  return config.repetitionsToMastery;
}

export function shouldAdvanceLevel(totalReps) {
  // Détermine si l'enfant devrait passer au niveau suivant selon les reps totales.
  if (totalReps < 200) return LEVELS.BEGINNER;
  if (totalReps < 600) return LEVELS.INTERMEDIATE;
  return LEVELS.ADVANCED;
}

export function getLevelLabel(level) {
  return getLevelConfig(level).name;
}

export function getLevelDescription(level) {
  return getLevelConfig(level).description;
}
