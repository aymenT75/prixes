// Moteur de pratique granulaire : orchestre tout (segmentation, adaptation, tarteel, prononciation).
// Interface unique pour la session de pratique.

import { getGranules } from "./wordBreaker.js";
import { getGranulesForLevel, getAudioSpeedForLevel, getTargetAccuracyForLevel } from "./levelAdapter.js";
import { TarteelPlayer, PronunciationRecorder } from "./tarteel.js";
import { PronunciationAnalyzer } from "./pronunciationAnalyzer.js";
import { TajweedAnalyzer } from "./tajweedFeedback.js";
import { getProgress, setProgress } from "./store.js";
import { review, isMastered } from "./srs.js";

export class PracticeSession {
  constructor(verse, level, reciterId, engine) {
    this.verse = verse;
    this.level = level;
    this.reciterId = reciterId;
    this.engine = engine; // Référence à l'engine principal

    this.tarteelPlayer = new TarteelPlayer(reciterId);
    this.recorder = new PronunciationRecorder();
    this.analyzer = new PronunciationAnalyzer();
    this.tajweedAnalyzer = new TajweedAnalyzer();

    // État de la session
    this.currentGranuleIndex = 0;
    this.granules = getGranulesForLevel(verse, level);
    this.results = [];
    this.isRecording = false;
  }

  getCurrentGranule() {
    return this.granules[this.currentGranuleIndex];
  }

  hasNextGranule() {
    return this.currentGranuleIndex < this.granules.length - 1;
  }

  async playTarteel() {
    // Joue l'audio tarteel du granule courant.
    const granule = this.getCurrentGranule();
    const audioSpeed = getAudioSpeedForLevel(this.level);

    try {
      await this.tarteelPlayer.playTarteel(
        this.verse.surahId,
        this.verse.verseNum,
        audioSpeed
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async startRecording() {
    // Démarre l'enregistrement de la prononciation de l'enfant.
    const result = await this.recorder.startRecording();
    if (result.success) {
      this.isRecording = true;
    }
    return result;
  }

  async stopRecordingAndAnalyze() {
    // Arrête l'enregistrement et analyse la prononciation.
    const recordingResult = await this.recorder.stopRecording();
    this.isRecording = false;

    if (!recordingResult.success) {
      return {
        success: false,
        error: recordingResult.error,
      };
    }

    const granule = this.getCurrentGranule();

    // Analyse la prononciation
    const analysisResult = await this.analyzer.analyzePronunciation(
      recordingResult.audio,
      granule
    );

    if (!analysisResult.success) {
      return {
        success: false,
        error: analysisResult.error,
      };
    }

    // Analyse les règles Tajweed
    const tajweedAnalysis = this.tajweedAnalyzer.analyzeTajweed(
      granule,
      analysisResult.transcription,
      {} // audioAnalysis (à améliorer)
    );

    const tajweedFeedback = this.tajweedAnalyzer.generateTajweedFeedback(tajweedAnalysis);

    // Enregistre le résultat
    const result = {
      granuleId: granule.id,
      success: analysisResult.passed,
      score: analysisResult.score,
      transcription: analysisResult.transcription,
      expected: analysisResult.expectedArabic,
      feedback: analysisResult.feedback,
      tajweedFeedback: tajweedFeedback,
      tajweedSummary: this.tajweedAnalyzer.getSummaryFeedback(tajweedFeedback),
    };

    this.results.push(result);

    // Met à jour la progression SRS
    const progress = getProgress(granule.id);
    const newProgress = review(progress, result.success);
    setProgress(granule.id, newProgress);

    // Met à jour les stats globales
    if (result.success) {
      this.engine.recordRepetition();
      this.engine.recordPracticeDay();

      // Calcule les points
      const pointsData = this.engine.practicePoints({
        accuracy: result.score,
        streakDays: this.engine.getStreak().days,
        firstLearn: progress.reviews === 0,
      });

      this.engine.addPoints(pointsData.total);
      result.pointsGained = pointsData.total;
      result.pointsBreakdown = pointsData.breakdown;
    }

    return {
      success: true,
      result: result,
    };
  }

  cancelRecording() {
    this.recorder.cancelRecording();
    this.isRecording = false;
  }

  async nextGranule() {
    // Passe au granule suivant.
    if (this.hasNextGranule()) {
      this.currentGranuleIndex++;
      return { success: true };
    }
    return { success: false, error: "Pas de granule suivante" };
  }

  getSessionSummary() {
    // Résumé de la session de pratique.
    const totalAttempts = this.results.length;
    const successfulAttempts = this.results.filter(r => r.success).length;
    const successRate = totalAttempts > 0 ? Math.round((successfulAttempts / totalAttempts) * 100) : 0;
    const totalPointsGained = this.results.reduce((sum, r) => sum + (r.pointsGained || 0), 0);

    return {
      verseId: this.verse.id,
      verseMeaning: this.verse.meaning,
      level: this.level,
      granulesAttempted: totalAttempts,
      granulesPassed: successfulAttempts,
      successRate: successRate,
      totalPointsGained: totalPointsGained,
      results: this.results,
      sessionComplete: !this.hasNextGranule() && totalAttempts > 0,
    };
  }

  getMasteryStatus(granuleId) {
    // Statut de maîtrise d'un granule.
    const progress = getProgress(granuleId);
    return {
      stage: progress.stage,
      reviews: progress.reviews,
      dueDate: progress.dueDate,
      isMastered: isMastered(progress),
    };
  }
}

// Export une fonction factory pour créer une session
export function createPracticeSession(verse, level, reciterId, engine) {
  return new PracticeSession(verse, level, reciterId, engine);
}
