// Analyse de prononciation : compare l'enfant vs tarteel référence avec Whisper API.
// Retourne un score de précision + feedback détaillé.

export class PronunciationAnalyzer {
  constructor(backendUrl = "http://localhost:8000") {
    this.backendUrl = backendUrl;
  }

  async transcribeAudio(audioBlob, granule) {
    // Envoie l'audio au backend Whisper pour transcription.
    // Retourne la transcription arabe de ce que l'enfant a dit.

    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    formData.append("granuleId", granule.id);
    formData.append("expectedArabic", granule.arabic);

    try {
      const response = await fetch(`${this.backendUrl}/api/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Transcription failed");

      const data = await response.json();
      return {
        success: true,
        transcription: data.transcription,
        confidence: data.confidence,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async analyzePronunciation(audioBlob, granule) {
    // Analyse complète : transcription + score + feedback.

    // 1. Transcrit l'audio de l'enfant
    const transcriptionResult = await this.transcribeAudio(audioBlob, granule);

    if (!transcriptionResult.success) {
      return {
        success: false,
        error: transcriptionResult.error,
        score: 0,
      };
    }

    // 2. Compare avec la référence (tarteelArabic)
    const score = this.calculateSimilarity(
      transcriptionResult.transcription,
      granule.arabic
    );

    // 3. Génère le feedback détaillé
    const feedback = this.generateFeedback(
      transcriptionResult.transcription,
      granule.arabic,
      score
    );

    return {
      success: true,
      transcription: transcriptionResult.transcription,
      expectedArabic: granule.arabic,
      score: Math.round(score * 100),
      confidence: transcriptionResult.confidence,
      feedback: feedback,
      passed: score >= 0.85, // 85% de similarité = réussi
    };
  }

  calculateSimilarity(transcribed, expected) {
    // Calcule la similarité entre ce qui a été dit et ce qui est attendu.
    // Utilise la distance de Levenshtein normalisée.

    const distance = this.levenshteinDistance(transcribed, expected);
    const maxLength = Math.max(transcribed.length, expected.length);

    if (maxLength === 0) return 1.0; // Les deux sont vides
    return 1 - (distance / maxLength);
  }

  levenshteinDistance(a, b) {
    // Distance de Levenshtein : nombre minimum d'éditions.
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,      // Insertion
          matrix[j - 1][i] + 1,      // Suppression
          matrix[j - 1][i - 1] + cost // Substitution
        );
      }
    }

    return matrix[b.length][a.length];
  }

  generateFeedback(transcribed, expected, score) {
    // Génère un feedback détaillé basé sur la prononciation.

    const feedback = [];

    if (score >= 0.95) {
      feedback.push({
        type: "excellent",
        message: "📍 Excellent ! Prononciation parfaite !",
      });
    } else if (score >= 0.85) {
      feedback.push({
        type: "good",
        message: "✅ Bien ! La prononciation est correcte.",
      });
    } else if (score >= 0.70) {
      feedback.push({
        type: "needs_work",
        message: "⚠️ Presque ! Écoute encore et réessaie.",
        suggestions: this.suggestCorrections(transcribed, expected),
      });
    } else {
      feedback.push({
        type: "try_again",
        message: "🔄 Essaie encore ! Écoute bien le tarteel.",
        suggestions: this.suggestCorrections(transcribed, expected),
      });
    }

    // Ajoute des détails techniques si nécessaire
    if (transcribed !== expected) {
      feedback.push({
        type: "detail",
        message: `Tu as dit: "${transcribed}"`,
        expected: `À dire: "${expected}"`,
      });
    }

    return feedback;
  }

  suggestCorrections(transcribed, expected) {
    // Suggère les corrections spécifiques à apporter.
    const suggestions = [];

    // Détecte les voyelles mal prononcées
    if (transcribed.includes("ا") && !expected.includes("ا")) {
      suggestions.push("Fais attention aux Fatha (◌َ)");
    }

    if (transcribed.includes("ي") && !expected.includes("ي")) {
      suggestions.push("Fais attention aux Kasra (◌ِ)");
    }

    if (transcribed.includes("و") && !expected.includes("و")) {
      suggestions.push("Fais attention aux Damma (◌ُ)");
    }

    // Détecte les assimilations (Idgham) manquées
    if (expected.includes("ن") && transcribed.includes("ن")) {
      suggestions.push("Assimile bien le Nûn (ن) avec la lettre suivante");
    }

    return suggestions.length > 0 ? suggestions : ["Réécoute le tarteel et concentre-toi sur chaque lettre."];
  }
}
