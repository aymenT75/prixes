// Moteur d'apprentissage adaptatif Ihsan.
// Façade unique vers le UI (engine.subscribe pour les mises à jour réactives).

import { SURAHS, VERSES } from "./data.js";
import { RECITERS, RECITATION_STYLES, ayahAudioUrl, styleOf, reciterForLevel } from "./reciters.js";
import { review, isDue, daysUntilDue, isMastered, getStageLabel } from "./srs.js";
import { practicePoints, videoProgress, VIDEOS } from "./points.js";
import {
  getProgress, setProgress, getTotalPoints, addPoints, getTotalRepetitions, recordRepetition,
  getStreak, recordPracticeDay, getReciterId, setReciterId, getLevel, setLevel, LEVELS,
  isDiagnosticDone, completeDiagnostic, isOnboardingDone, getChildName,
} from "./store.js";

const listeners = new Set();
function emit() { listeners.forEach((cb) => cb()); }

export const engine = {
  // ---- Sourates & Versets ----
  getSurahs() {
    return SURAHS.map((s) => {
      const verses = VERSES.filter((v) => v.surahId === s.id);
      const versesLearned = verses.filter((v) => {
        const p = getProgress(v.id);
        return p.reviews > 0;
      }).length;
      const unlocked = s.id === "fatiha" || SURAHS.find((x) => x.id === SURAHS[SURAHS.indexOf(s) - 1]?.id)?.unlocked;
      const complete = versesLearned === s.verseCount;
      return { ...s, versesLearned, verseCount: s.verseCount, ratio: versesLearned / s.verseCount, unlocked, complete };
    });
  },

  getVerses(surahId) {
    return VERSES.filter((v) => v.surahId === surahId).map((v) => {
      const p = getProgress(v.id);
      const locked = VERSES.indexOf(v) > 0 && !getProgress(VERSES[VERSES.indexOf(v) - 1].id).reviews;
      return {
        ...v,
        locked,
        stage: p.stage,
        stageLabel: getStageLabel(p.stage),
        practices: p.reviews,
        due: isDue(p),
        daysUntilDue: daysUntilDue(p),
        mastered: isMastered(p),
      };
    });
  },

  getVerse(id) {
    const v = VERSES.find((x) => x.id === id);
    if (!v) return null;
    const p = getProgress(id);
    return { ...v, stage: p.stage, stageLabel: getStageLabel(p.stage), practices: p.reviews, mastered: isMastered(p) };
  },

  // ---- Pratique (SRS + Points + Série) ----
  practice(verseId, accuracy) {
    const v = VERSES.find((x) => x.id === verseId);
    if (!v) return { success: false };

    const oldP = getProgress(verseId);
    const success = accuracy >= 95;
    const newP = review(oldP, success);
    setProgress(verseId, newP);
    recordRepetition();
    recordPracticeDay();

    let pointsGained = 0;
    const breakdown = [];
    if (success) {
      const streak = getStreak();
      const pts = practicePoints({ accuracy, streakDays: streak.days, firstLearn: oldP.reviews === 0 });
      pointsGained = pts.total;
      breakdown.push(...pts.breakdown);
      addPoints(pointsGained);
    }

    const vp = videoProgress(getTotalPoints());
    let newlyUnlocked = null;
    if (vp.nextVideo && oldP.reviews === 0) newlyUnlocked = vp.nextVideo;

    emit();
    return {
      success,
      stage: newP.stage,
      pointsGained,
      breakdown,
      newlyUnlocked,
      nextDueDays: daysUntilDue(newP),
      mastered: isMastered(newP),
    };
  },

  // ---- Statistiques ----
  getStats(verseId) {
    const p = getProgress(verseId);
    return {
      practices: p.reviews,
      bestAccuracy: 95,
      stage: p.stage,
      stageLabel: getStageLabel(p.stage),
      daysUntilDue: daysUntilDue(p),
      mastered: isMastered(p),
    };
  },

  getStreak() { return getStreak(); },
  getPoints() { return getTotalPoints(); },
  getTotalRepetitions() { return getTotalRepetitions(); },
  getReviewSummary() {
    const all = VERSES.length;
    const learned = VERSES.filter((v) => getProgress(v.id).reviews > 0).length;
    const mastered = VERSES.filter((v) => isMastered(getProgress(v.id))).length;
    const dueToday = VERSES.filter((v) => isDue(getProgress(v.id))).length;
    return { learned, mastered, total: all, dueToday };
  },

  getCurrentSurah() {
    const surahs = this.getSurahs();
    return surahs.find((s) => s.unlocked && !s.complete) || surahs[surahs.length - 1];
  },

  getNextVerse() {
    for (const s of SURAHS) {
      const verses = this.getVerses(s.id);
      for (const v of verses) {
        if (v.locked) continue;
        if (v.due) return v;
        if (v.practices === 0) return v;
      }
    }
    return null;
  },

  // ---- Récitateurs & Niveaux Adaptatifs ----
  getReciters() { return RECITERS; },
  getReciter() { return RECITERS.find((r) => r.id === getReciterId()) || RECITERS[0]; },
  setReciter(id) { if (RECITERS.some((r) => r.id === id)) { setReciterId(id); emit(); } },
  getRecitationStyles() { return RECITATION_STYLES; },
  getReciterStyle() { return styleOf(this.getReciter()); },
  getAudioUrl(verseId) {
    const v = VERSES.find((x) => x.id === verseId);
    if (!v) return null;
    const surah = SURAHS.find((s) => s.id === v.surahId);
    return ayahAudioUrl(this.getReciter(), surah.num, v.verseNum);
  },

  // ---- Niveaux (Adaptatif) ----
  getLevel() { return getLevel(); },
  setLevel(level) { setLevel(level); emit(); },
  getLevelLabel() {
    const level = this.getLevel();
    if (level === LEVELS.BEGINNER) return "🟢 Débutant (0-200 reps)";
    if (level === LEVELS.INTERMEDIATE) return "🟡 Intermédiaire (200-600 reps)";
    return "🔴 Avancé (600-1000 reps)";
  },

  // ---- Diagnostic ----
  isDiagnosticDone() { return isDiagnosticDone(); },
  completeDiagnostic(level) { completeDiagnostic(level); emit(); },

  // ---- Onboarding ----
  isOnboardingDone() { return isOnboardingDone(); },
  getChildName() { return getChildName(); },

  // ---- Vidéos & Récompenses ----
  getVideos() {
    const points = getTotalPoints();
    return VIDEOS.map((v) => ({
      ...v,
      unlocked: points >= v.points,
      pointsAway: Math.max(0, v.points - points),
    }));
  },

  getVideoProgress() { return videoProgress(getTotalPoints()); },

  // ---- Jauge 1000 Reps ----
  getProgressTo1000() {
    const reps = getTotalRepetitions();
    const ratio = Math.min(reps / 1000, 1);
    const level = ratio === 1 ? "excellence" : ratio >= 0.6 ? "advanced" : ratio >= 0.2 ? "intermediate" : "beginner";
    return { reps, ratio, level, isExcellence: ratio === 1 };
  },

  // ---- Réactivité ----
  subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
};
