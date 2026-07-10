# Protocole de tests utilisateurs — Prixes

> Document prêt à l'emploi pour la personne qui fait passer les tests (le « facilitateur »).
> App : https://prixes.omnilink.software · Durée d'une session : ~30 min · 5 à 8 participants suffisent.

---

## 1. Objectifs

On cherche à répondre à 4 questions :

1. **Compréhension** — Les gens comprennent-ils la promesse (comparer les prix, trouver le moins cher) dès l'accueil ?
2. **Efficacité** — Réussissent-ils les parcours clés **sans aide** ?
3. **Points de friction** — Où hésitent-ils, se trompent-ils, abandonnent-ils ?
4. **Accessibilité** — L'app est-elle utilisable par notre public cible (personnes âgées, malvoyantes, usage vocal) ?

## 2. Participants (5–8 personnes)

| Profil | Nombre | Pourquoi |
|--------|--------|----------|
| Acheteur·se du quotidien (budget serré, famille) | 2–3 | Cœur de cible |
| Personne âgée / malvoyante / usage vocal | 2 | Différenciateur accessibilité |
| Automobiliste (module Carburant) | 1–2 | Vérifier ce parcours spécifique |

> 5 personnes bien choisies révèlent ~80 % des problèmes. Inutile d'en recruter 20.

## 3. Déroulé d'une session (30 min)

1. **Accueil (3 min)** — Mettre à l'aise. « On teste l'app, **pas vous**. Il n'y a pas de mauvaise réponse. »
2. **Consentement** — Autorisation d'enregistrer l'écran/la voix (facultatif).
3. **Premières impressions (2 min)** — Montrer l'accueil **sans rien expliquer** : « Selon vous, à quoi sert cette app ? Que feriez-vous en premier ? »
4. **Tâches (18 min)** — Voir §4. **Penser à voix haute.** Le facilitateur **n'aide pas** (sauf blocage total > 1 min).
5. **Débrief (5 min)** — Questions ouvertes + questionnaire SUS (§6).
6. **Merci (2 min)**.

## 4. Tâches (donner l'objectif, pas le chemin)

Pour chaque tâche, noter : **réussie ✅ / avec aide 🟡 / échec ❌**, le temps, et les hésitations.

1. « Trouvez le **prix le moins cher** pour un paquet de café. »
   *(recherche → fiche produit → comparatif magasins)*
2. « Vous voulez l'acheter aujourd'hui : trouvez le **magasin le plus proche** qui le vend et l'itinéraire. »
   *(fiche → carte → itinéraire — nouvelle fonctionnalité)*
3. « Scannez le **code-barres** d'un produit que vous avez sous la main. »
4. « Trouvez la **station essence la moins chère** près de chez vous. »
5. « Faites en sorte d'être **prévenu·e si le prix baisse** sur un produit. » *(alerte de prix)*
6. « Ajoutez 2 produits à votre **liste de courses**. »
7. **Accessibilité** — « Le texte est trop petit : **agrandissez-le**. » puis « Utilisez la **voix** pour chercher un produit. »
8. « Laissez-nous **votre avis** sur l'app. » *(formulaire /feedback)*

## 5. Grille d'observation (à remplir en direct)

| # Tâche | Résultat (✅/🟡/❌) | Temps | Où ça bloque | Verbatim (citation) |
|---------|--------------------|-------|--------------|---------------------|
| 1 Prix le moins cher | | | | |
| 2 Magasin proche + itinéraire | | | | |
| 3 Scanner | | | | |
| 4 Carburant | | | | |
| 5 Alerte prix | | | | |
| 6 Liste de courses | | | | |
| 7 Accessibilité (texte + voix) | | | | |
| 8 Donner un avis | | | | |

## 6. Questionnaire SUS (System Usability Scale) — fin de session

Répondre de **1 (pas du tout d'accord)** à **5 (tout à fait d'accord)** :

1. J'aimerais utiliser cette app fréquemment.
2. Je trouve l'app inutilement complexe.
3. L'app est facile à utiliser.
4. J'aurais besoin d'aide pour utiliser cette app.
5. Les fonctions sont bien intégrées.
6. Il y a trop d'incohérences.
7. La plupart des gens apprendraient à s'en servir très vite.
8. L'app est lourde/pénible à utiliser.
9. Je me suis senti·e en confiance en l'utilisant.
10. J'ai dû apprendre beaucoup de choses avant de pouvoir m'en servir.

**Calcul du score** : items impairs → (réponse − 1) ; items pairs → (5 − réponse) ; additionner ; × 2,5 → note /100.
Repère : **> 68 = au-dessus de la moyenne**, > 80 = excellent.

## 7. Ce qu'on regarde EN PLUS des tests (données objectives)

- **Statistiques d'usage** (Compte → *Statistiques d'usage*, réservé admin) : écrans les plus vus, où les gens s'arrêtent, nombre de sessions. Analytics anonyme, sans cookie, respecte « Do Not Track ».
- **Avis reçus** (Compte → *Avis reçus*, admin) : les retours du formulaire /feedback, avec note moyenne et répartition.

## 8. Après les tests — prioriser

Classer chaque problème observé sur 2 axes :

- **Gravité** : bloque la tâche (🔴) / ralentit (🟡) / gêne mineure (🟢)
- **Fréquence** : combien de participants l'ont rencontré

> Corriger d'abord les 🔴 vus par **plusieurs** personnes. Regrouper les correctifs par écran.

---

### Idées de pistes d'amélioration à surveiller pendant les tests
- Le libellé/emplacement de la recherche est-il évident depuis l'accueil ?
- Le passage fiche produit → carte du magasin est-il compris ?
- Le scanner : les gens trouvent-ils le bouton et comprennent-ils quoi viser ?
- Les personnes âgées : taille des boutons, lisibilité, l'assistant vocal est-il découvert ?
