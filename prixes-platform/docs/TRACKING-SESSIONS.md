# Tracking des Sessions — Prixes Tests

Copie ce tableau dans Google Sheets ou Excel pour tracker tous tes testeurs.

---

## 📋 Tableau de suivi

| # | Nom | Email | Profil | Date | Heure | Statut | SUS | Top problème | Notes |
|---|-----|-------|--------|------|-------|--------|-----|--------------|-------|
| 1 | Alice | alice@... | Budget serré | 2025-08-18 | 14h | ✅ Fait | 72 | Search pas évidente | Cherchait les filtres |
| 2 | Bob | bob@... | Senior | 2025-08-19 | 10h | ✅ Fait | 68 | Buttons trop petits | Vision faible |
| 3 | Clara | clara@... | Budget serré | 2025-08-20 | 15h | ⏳ Prévu | — | — | — |
| 4 | David | david@... | Étudiant | 2025-08-21 | 11h | ❌ Annulé | — | — | Plus de nouvelles |
| 5 | Eva | eva@... | Mom | 2025-08-22 | 16h | ⏳ Prévu | — | — | — |

---

## 🎯 Template à remplir

Télécharge ou copie dans Google Sheets :

```
Statut : ⏳ Prévu | ✅ Fait | ❌ Annulé | 🔄 Reporter

Profil : Acheteur quotidien | Senior | Autre

SUS : [score /100]

Top problème : Décris le blocage principal en 1 phrase

Notes : Autres observations, verbatims intéressants
```

---

## 📊 Analyse après chaque session

**À remplir dans une 2e feuille :**

| Tâche | Réussies (✅) | Avec aide (🟡) | Échouées (❌) | % Succès |
|-------|---------------|--|--|--|
| 1. Prix moins cher | 5 | 1 | 0 | 83% |
| 2. Magasin proche | 4 | 2 | 0 | 67% |
| 3. Scanner | 3 | 1 | 2 | 50% |
| 4. Essence | 5 | 1 | 0 | 83% |
| 5. Alerte prix | 4 | 1 | 1 | 67% |
| 6. Liste courses | 5 | 0 | 1 | 83% |
| 7. Accessibilité | 4 | 1 | 1 | 67% |
| 8. Avis | 6 | 0 | 0 | 100% |

---

## 🎯 Synthèse finale (après 5–8 sessions)

**Feuille 3 — Résumé & Roadmap**

```
**SUS Score moyen :** [moyenne]
Repère : > 68 = au-dessus de la moyenne, > 80 = excellent

**Tâches qui bloquent le plus :**
1. [Tâche + % d'échecz]
2. [Tâche + % d'échecz]
3. [Tâche + % d'échecz]

**Top 3 things to fix (par fréquence) :**
1. 🔴 [Bloque 5+ testeurs] → Fix URGENT
2. 🟡 [Bloque 3–4 testeurs] → Fix important
3. 🟢 [Bloque 1–2 testeurs] → Polish

**Verbatims clés** (ce qu'ils ont dit exactement) :
- « C'est pas clair où chercher »
- « Les boutons c'est tout petit »
- « J'aime beaucoup l'assistant vocal »

**Prochaines itérations :**
- Feature 1 (basée sur le feedback)
- Fix 1 (recherche)
- Fix 2 (taille des boutons)
```

---

## 💡 Tips

1. **Partage ce tracking** — envoie le lien Google Sheets à ton mentor/ami pour feedback
2. **Met à jour en direct** — pas d'oublis après coup
3. **Note le temps réel** — pas la durée prévue, la vraie durée observée
4. **Garde les emails** — pour relancer les testeurs avec les changements plus tard
5. **Les SUS scores ne sont qu'un signal** — combine avec tes observations (un 70 SUS c'est bon, mais si tout le monde bloque sur la même tâche = DANGER)

---

## 📥 Exporter après

Une fois tout complété :
- Exporte en PDF (Google Sheets → Télécharger → PDF)
- Archive dans `prixes-platform/tests/sessions-2025-08.pdf`
- C'est ta preuve de la session + tes données pour la roadmap

Bon courage ! 🚀
