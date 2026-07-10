// Spaced Repetition System (SRS) : paliers 1-5 (stage 6 = maîtrisé).
// Intervalles : 1, 3, 7, 14, 30, 60 jours. Réussite : +1 stage ; échec : -1 stage (min 0).

export const INTERVALS = [1, 3, 7, 14, 30, 60];
export const MASTERED_STAGE = 6;

export function defaultProgress(verseId) {
  return {
    verseId,
    stage: 0,        // palier actuel (0-5 avant maîtrise)
    reviews: 0,      // nombre de révisions
    dueDate: new Date().toISOString().slice(0, 10), // peut être révisé aujourd'hui
  };
}

export function review(progress, success) {
  const newStage = success ? Math.min(progress.stage + 1, 5) : Math.max(progress.stage - 1, 0);
  const daysUntilNext = success ? INTERVALS[newStage] : INTERVALS[Math.max(newStage, 1)];
  const nextDueDate = new Date();
  nextDueDate.setDate(nextDueDate.getDate() + daysUntilNext);
  return {
    ...progress,
    stage: newStage,
    reviews: progress.reviews + 1,
    dueDate: nextDueDate.toISOString().slice(0, 10),
  };
}

export function isDue(progress) {
  return progress.dueDate <= new Date().toISOString().slice(0, 10);
}

export function daysUntilDue(progress) {
  const due = new Date(progress.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const ms = due - today;
  return Math.max(0, Math.ceil(ms / 86400000));
}

export function isMastered(progress) {
  return progress.stage >= MASTERED_STAGE;
}

export function getStageLabel(stage) {
  return stage >= MASTERED_STAGE ? "Maîtrisé 🔒" : `${stage + 1}/${MASTERED_STAGE}`;
}
