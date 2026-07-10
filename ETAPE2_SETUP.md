# Étape 2 : Apprentissage Granulaire avec Tarteel

**Objectif** : Apprendre le Coran par mots/phrases adaptés au niveau, avec analyse de prononciation via Whisper API.

---

## 📋 Fichiers créés

### Frontend (JavaScript - `qaida-app/js/`)
- ✅ `wordBreaker.js` — Segmente les versets en mots/phrases
- ✅ `levelAdapter.js` — Adapte le contenu par niveau (Débutant/Intermédiaire/Avancé)
- ✅ `tarteel.js` — Gestion audio tarteel + enregistrement
- ✅ `pronunciationAnalyzer.js` — Analyse prononciation avec Whisper
- ✅ `tajweedFeedback.js` — Feedback détaillé sur les règles Tajweed
- ✅ `practiceEngine.js` — Moteur de pratique complet

### Backend (Python - `api/`)
- ✅ `transcribe.py` — API FastAPI + Whisper pour transcription arabe

### Configuration
- ✅ `.env` — Clé API OpenAI (déjà créée)
- ✅ `requirements.txt` — Dépendances Python

---

## 🚀 Comment lancer

### 1. Installe les dépendances Python

```bash
# Windows PowerShell
pip install -r requirements.txt

# Ou avec uv (si disponible)
uv pip install -r requirements.txt
```

### 2. Vérifie que `.env` existe

```bash
cat .env
# Doit afficher: OPENAI_API_KEY=sk-proj-...
```

### 3. Lance le backend FastAPI

```bash
python api/transcribe.py
# Ou
uvicorn api.transcribe:app --reload --port 8000
```

**Sortie attendue** :
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

### 4. Vérifie que l'API marche

**Terminal séparé** :
```bash
curl http://localhost:8000/health
```

**Réponse attendue** :
```json
{
  "status": "ok",
  "service": "Ihsan Transcription API",
  "whisper_available": true
}
```

### 5. Lance le frontend Ihsan

```bash
cd qaida-app
python -m http.server 8080
```

**Visite** : http://localhost:8080

---

## 🧪 Test manuel

### Transcription simple

```bash
curl -X POST http://localhost:8000/api/transcribe \
  -F "audio=@recording.webm" \
  -F "granuleId=fatiha:1.word1" \
  -F "expectedArabic=بِسْمِ"
```

### Analyse complète

```bash
curl -X POST http://localhost:8000/api/analyze-pronunciation \
  -F "audio=@recording.webm" \
  -F "granuleId=fatiha:1.word1" \
  -F "expectedArabic=بِسْمِ" \
  -F "expectedTranslit=Bismi"
```

---

## 📊 Architecture Étape 2

```
Frontend (JavaScript)
├── wordBreaker.js          : Segmentation (mots/phrases)
├── levelAdapter.js         : Adaptation par niveau
├── tarteel.js             : Audio + enregistrement
├── pronunciationAnalyzer.js : Analyse prononciation (appelle backend)
├── tajweedFeedback.js     : Feedback Tajweed
└── practiceEngine.js       : Orchestration complète

                ↕ HTTP API

Backend (Python/FastAPI)
├── /api/transcribe         : Whisper simple
└── /api/analyze-pronunciation : Analyse complète

                ↕ OpenAI API

OpenAI Whisper
└── Transcription arabe classique
```

---

## 🎯 Flux de pratique (Étape 2)

1. **Enfant voit le mot/phrase arabe** (adapté à son niveau)
   - Débutant : 1 mot à la fois
   - Intermédiaire : phrase (3 mots)
   - Avancé : verset entier

2. **Écoute le Tarteel** (vitesse adaptée)
   - Débutant : 75% (ralenti)
   - Intermédiaire : 90%
   - Avancé : 100% (normal)

3. **Enregistre sa prononciation**
   - Web Audio API
   - Format WebM

4. **Backend analyse avec Whisper**
   - Transcrit ce qu'il a dit
   - Compare avec référence
   - Calcule score de similarité

5. **Feedback détaillé**
   - Prononciation correcte ? (✅ Bien / ⚠️ Presque / 🔄 Essaie)
   - Règles Tajweed appliquées ? (Al-Ghunnah, Idgham, etc.)
   - Points gagnés

---

## ⚠️ Limitations actuelles (à améliorer)

- ❌ Segmentation audio par mot (forced alignment) — À implémenter
- ❌ Analyse MFCC complète — Placeholder
- ❌ Analyse de Tajweed acoustique — Placeholder
- ❌ Gestion des fichiers audio tarteel — À héberger

---

## 📝 Prochaines étapes (Étape 3)

- [ ] Intégrer vrai Forced Alignment pour segmenter audio par mot
- [ ] Implémenter MFCC + DTW pour comparaison spectrale
- [ ] Ajouter analyse Tajweed acoustique (formants, nasalité, etc.)
- [ ] Héberger les fichiers audio tarteel (AWS S3, etc.)
- [ ] UI de pratique interactive (boutons, feedback visuel)
- [ ] Dashboard enfant (progrès, versets maîtrisés)

---

## 🔐 Sécurité

- ✅ Clé API OpenAI dans `.env` (jamais en dur)
- ✅ `.env` ignoré par git (dans `.gitignore`)
- ⚠️ À restreindre CORS en production (domaines spécifiques)
- ⚠️ À ajouter rate limiting (pour éviter abus API Whisper)

---

## 📞 Support

**Backend sur un port différent ?**
```python
# Dans api/transcribe.py
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9000)  # Port 9000
```

**Frontend doit appeler une URL différente ?**
```javascript
// Dans pronunciationAnalyzer.js
const analyzer = new PronunciationAnalyzer("http://localhost:9000");
```

---

**✅ Étape 2 est prête ! Prêt pour tester ?**
