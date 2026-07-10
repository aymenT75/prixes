#!/usr/bin/env python3
"""
Backend FastAPI pour transcription Whisper + analyse prononciation Coran.
Étape 2: Apprentissage granulaire avec Tarteel (prononciation correcte).
"""

import os
import io
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import openai

# Charge les variables d'environnement
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY non définie dans .env")

openai.api_key = OPENAI_API_KEY

# Crée l'app FastAPI
app = FastAPI(
    title="Ihsan Transcription API",
    description="Transcription Whisper pour l'apprentissage du Coran",
    version="1.0.0"
)

# Configure CORS (permet les requêtes du frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # À restreindre en prod (http://localhost:3000, etc.)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    """Vérifie que l'API est opérationnelle."""
    return {
        "status": "ok",
        "service": "Ihsan Transcription API",
        "whisper_available": bool(OPENAI_API_KEY),
    }


@app.post("/api/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    granuleId: str = Form(...),
    expectedArabic: str = Form(...),
):
    """
    Transcrit un audio arabe enregistré par l'enfant avec Whisper.

    Args:
        audio: Fichier audio enregistré (webm, mp3, wav, etc.)
        granuleId: ID du granule (mot/phrase) en cours d'apprentissage
        expectedArabic: Texte arabe attendu (pour comparaison)

    Returns:
        {
            "granuleId": "fatiha:1.word1",
            "transcription": "بِسْمِ",
            "expectedArabic": "بِسْمِ",
            "confidence": 0.95,
            "matchScore": 0.98
        }
    """

    try:
        # 1. Lit le fichier audio
        audio_content = await audio.read()

        if not audio_content:
            raise HTTPException(status_code=400, detail="Fichier audio vide")

        # 2. Transcrit avec Whisper (arabe classique)
        transcript = openai.Audio.transcribe(
            model="whisper-1",
            file=(audio.filename, io.BytesIO(audio_content), audio.content_type),
            language="ar",  # Force l'arabe
        )

        transcription = transcript.get("text", "").strip()

        # 3. Calcule la confiance (Whisper fournit parfois ce score)
        confidence = transcript.get("confidence", 0.9)  # Par défaut 0.9

        # 4. Compare avec la référence
        match_score = calculate_similarity(transcription, expectedArabic)

        return {
            "granuleId": granuleId,
            "transcription": transcription,
            "expectedArabic": expectedArabic,
            "confidence": confidence,
            "matchScore": round(match_score, 3),
            "passed": match_score >= 0.85,  # 85% de similarité = réussi
        }

    except openai.error.APIError as e:
        raise HTTPException(status_code=500, detail=f"OpenAI API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@app.post("/api/analyze-pronunciation")
async def analyze_pronunciation(
    audio: UploadFile = File(...),
    granuleId: str = Form(...),
    expectedArabic: str = Form(...),
    expectedTranslit: str = Form(...),
):
    """
    Analyse complète : transcription + feedback détaillé + Tajweed.

    Returns:
        {
            "granuleId": "fatiha:1.word1",
            "transcription": "بِسْمِ",
            "matchScore": 0.98,
            "feedback": [
                {"type": "excellent", "message": "Prononciation parfaite !"}
            ],
            "tajweedRules": [...]
        }
    """

    try:
        # Transcrit l'audio
        audio_content = await audio.read()
        transcript = openai.Audio.transcribe(
            model="whisper-1",
            file=(audio.filename, io.BytesIO(audio_content), audio.content_type),
            language="ar",
        )

        transcription = transcript.get("text", "").strip()
        match_score = calculate_similarity(transcription, expectedArabic)

        # Génère le feedback
        feedback = generate_feedback(transcription, expectedArabic, match_score)

        # Analyse les règles Tajweed (simplifié)
        tajweed_rules = analyze_tajweed_rules(expectedArabic, match_score)

        return {
            "granuleId": granuleId,
            "transcription": transcription,
            "expectedArabic": expectedArabic,
            "expectedTranslit": expectedTranslit,
            "matchScore": round(match_score, 3),
            "feedback": feedback,
            "tajweedRules": tajweed_rules,
            "passed": match_score >= 0.85,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


def calculate_similarity(transcribed: str, expected: str) -> float:
    """
    Calcule la similarité entre la transcription et le texte attendu.
    Utilise la distance de Levenshtein normalisée.

    Returns:
        float: Score entre 0 et 1 (1 = identique)
    """

    def levenshtein_distance(a: str, b: str) -> int:
        """Distance de Levenshtein."""
        if not a:
            return len(b)
        if not b:
            return len(a)

        matrix = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]

        for i in range(len(a) + 1):
            matrix[i][0] = i
        for j in range(len(b) + 1):
            matrix[0][j] = j

        for i in range(1, len(a) + 1):
            for j in range(1, len(b) + 1):
                cost = 0 if a[i - 1] == b[j - 1] else 1
                matrix[i][j] = min(
                    matrix[i - 1][j] + 1,      # Suppression
                    matrix[i][j - 1] + 1,      # Insertion
                    matrix[i - 1][j - 1] + cost  # Substitution
                )

        return matrix[len(a)][len(b)]

    distance = levenshtein_distance(transcribed, expected)
    max_length = max(len(transcribed), len(expected))

    if max_length == 0:
        return 1.0

    return 1 - (distance / max_length)


def generate_feedback(transcribed: str, expected: str, score: float) -> list:
    """Génère le feedback détaillé basé sur le score."""

    feedback = []

    if score >= 0.95:
        feedback.append({
            "type": "excellent",
            "emoji": "📍",
            "message": "Excellent ! Prononciation parfaite !",
        })
    elif score >= 0.85:
        feedback.append({
            "type": "good",
            "emoji": "✅",
            "message": "Bien ! La prononciation est correcte.",
        })
    elif score >= 0.70:
        feedback.append({
            "type": "needs_work",
            "emoji": "⚠️",
            "message": "Presque ! Écoute encore et réessaie.",
        })
    else:
        feedback.append({
            "type": "try_again",
            "emoji": "🔄",
            "message": "Essaie encore ! Écoute bien le tarteel.",
        })

    if transcribed != expected:
        feedback.append({
            "type": "detail",
            "message": f'Tu as dit: "{transcribed}"',
            "expected": f'À dire: "{expected}"',
        })

    return feedback


def analyze_tajweed_rules(arabic: str, score: float) -> list:
    """
    Analyse les règles Tajweed (simplifié).
    À améliorer avec analyse acoustique réelle.
    """

    rules = []

    # Détecte les lettres avec règles spécifiques
    tajweed_letters = {
        "ن": "Al-Ghunnah (nasalisation)",
        "م": "Al-Ghunnah (nasalisation)",
        "ل": "Clarification du Lâm",
        "ر": "Roulement du Râ",
        "ق": "Qalqala (tremolo)",
        "ط": "Tafkhim (épaississement)",
        "ص": "Tafkhim (épaississement)",
    }

    for letter, rule_name in tajweed_letters.items():
        if letter in arabic:
            rules.append({
                "letter": letter,
                "rule": rule_name,
                "status": "good" if score >= 0.85 else "needs_work",
            })

    return rules


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
