// Règles Tajweed (تجويد) : feedback détaillé sur les règles de prononciation du Coran.
// Idgham, Ikhfaa, Ghunnah, Madd, Qalqala, Waqf, etc.

export class TajweedAnalyzer {
  constructor() {
    this.rules = this.initializeTajweedRules();
  }

  initializeTajweedRules() {
    // Règles de base du Tajweed
    return {
      // ASSIMILATION (Al-Idgham - الإدغام)
      idgham: {
        name: "Al-Idgham (الإدغام)",
        description: "Assimilation : une lettre se fond avec une autre",
        letters: ["ن", "ل", "ر", "م"],
        feedback: "Assimile bien cette lettre avec la suivante",
      },

      // NASALISATION (Al-Ghunnah - الغنة)
      ghunnah: {
        name: "Al-Ghunnah (الغنة)",
        description: "Nasalisation : prononciation nasale du Nûn et Mîm",
        letters: ["ن", "م"],
        feedback: "Pronuncie avec un son nasal (comme 'ng')",
      },

      // ALLONGEMENT (Al-Madd - المد)
      madd: {
        name: "Al-Madd (المد)",
        description: "Allongement des voyelles",
        types: {
          maddTabii: "Madd naturel (2 temps)",
          maddLazim: "Madd obligatoire (4-6 temps)",
        },
        feedback: "Allonge cette voyelle",
      },

      // ROULEMENT (Al-Tafkhim - التفخيم)
      tafkhim: {
        name: "Al-Tafkhim (التفخيم)",
        description: "Épaississement de certaines lettres",
        letters: ["ط", "ظ", "ص", "ض", "غ", "خ", "ق", "ل"],
        feedback: "Pronuncie cette lettre de manière plus épaisse/grave",
      },

      // CLARTÉ (Al-Tarqiq - الترقيق)
      tarqiq: {
        name: "Al-Tarqiq (الترقيق)",
        description: "Légèreté de certaines lettres",
        feedback: "Pronuncie cette lettre de manière plus légère",
      },

      // ARRÊT (Waqf - الوقف)
      waqf: {
        name: "Waqf (الوقف)",
        description: "Arrêt approprié entre versets",
        types: {
          waqfTamm: "Arrêt complet",
          waqfKafyy: "Arrêt suffisant",
        },
        feedback: "Fais une petite pause ici avant de continuer",
      },

      // TREMOLO (Al-Qalqala - القلقلة)
      qalqala: {
        name: "Al-Qalqala (القلقلة)",
        description: "Tremolo sur certaines consonnes",
        letters: ["ق", "ط", "ب", "ج", "د"],
        feedback: "Pronuncie cette lettre avec un petit tremolo",
      },
    };
  }

  analyzeTajweed(granule, transcription, audioAnalysis) {
    // Analyse les règles Tajweed dans le granule.
    const detectedRules = [];

    // Scan chaque lettre du granule pour les règles
    for (let i = 0; i < granule.arabic.length; i++) {
      const letter = granule.arabic[i];
      const nextLetter = granule.arabic[i + 1];

      // Idgham (Assimilation)
      if (letter === "ن" && this.rules.idgham.letters.includes(nextLetter)) {
        detectedRules.push({
          rule: "idgham",
          position: i,
          letter: letter,
          feedback: this.rules.idgham.feedback,
          correct: this.checkIdghamCorrect(transcription, i),
        });
      }

      // Ghunnah (Nasalisation)
      if (this.rules.ghunnah.letters.includes(letter)) {
        detectedRules.push({
          rule: "ghunnah",
          position: i,
          letter: letter,
          feedback: this.rules.ghunnah.feedback,
          correct: this.checkGhunnah(audioAnalysis, i),
        });
      }

      // Tafkhim (Épaississement)
      if (this.rules.tafkhim.letters.includes(letter)) {
        detectedRules.push({
          rule: "tafkhim",
          position: i,
          letter: letter,
          feedback: this.rules.tafkhim.feedback,
          correct: this.checkTafkhim(audioAnalysis, i),
        });
      }

      // Qalqala (Tremolo)
      if (this.rules.qalqala.letters.includes(letter)) {
        detectedRules.push({
          rule: "qalqala",
          position: i,
          letter: letter,
          feedback: this.rules.qalqala.feedback,
          correct: this.checkQalqala(audioAnalysis, i),
        });
      }
    }

    return detectedRules;
  }

  checkIdghamCorrect(transcription, position) {
    // Vérifie si l'assimilation a été prononcée correctement.
    // Simplification : check si la lettre est bien prononcée
    return true; // À améliorer avec analyse acoustique
  }

  checkGhunnah(audioAnalysis, position) {
    // Vérifie si la nasalisation est correcte (analyse spectrale).
    // Cherche les formants nasaux (F0, F1, F2, etc.)
    if (!audioAnalysis || !audioAnalysis.samples) return false;
    return true; // À améliorer avec MFCC
  }

  checkTafkhim(audioAnalysis, position) {
    // Vérifie si l'épaississement est correct (fréquence plus grave).
    if (!audioAnalysis || !audioAnalysis.samples) return false;
    return true; // À améliorer avec analyse fréquentielle
  }

  checkQalqala(audioAnalysis, position) {
    // Vérifie si le tremolo est présent (amplitude spécifique).
    if (!audioAnalysis || !audioAnalysis.samples) return false;
    return true; // À améliorer avec analyse d'amplitude
  }

  generateTajweedFeedback(detectedRules) {
    // Génère un feedback détaillé basé sur les règles Tajweed appliquées.
    const feedback = {
      correct: [],
      needsWork: [],
    };

    for (const rule of detectedRules) {
      const ruleInfo = this.rules[rule.rule];

      if (rule.correct) {
        feedback.correct.push({
          emoji: "✅",
          rule: ruleInfo.name,
          message: `Bonne application de ${ruleInfo.name}`,
        });
      } else {
        feedback.needsWork.push({
          emoji: "⚠️",
          rule: ruleInfo.name,
          message: ruleInfo.feedback,
          position: rule.position,
        });
      }
    }

    return feedback;
  }

  getSummaryFeedback(tajweedAnalysis) {
    // Résumé des points Tajweed à améliorer.
    if (tajweedAnalysis.needsWork.length === 0) {
      return "🎯 Excellent Tajweed ! Toutes les règles sont respectées.";
    }

    if (tajweedAnalysis.needsWork.length === 1) {
      return `⚠️ Travaille sur : ${tajweedAnalysis.needsWork[0].rule}`;
    }

    return `⚠️ Travaille sur ces ${tajweedAnalysis.needsWork.length} points: ${tajweedAnalysis.needsWork.map(r => r.rule).join(", ")}`;
  }
}
