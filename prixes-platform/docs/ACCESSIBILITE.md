# Accessibilité de Prixes — audit et état réel

**Référentiel** : WCAG 2.1 niveau AA (base du RGAA).
**Date de l'audit** : 23 septembre 2026 · branche `a11y-audit` · commit `79e50c1`.
**Périmètre** : l'application web / PWA, qui est aussi le contenu de l'app Android
(l'APK Capacitor embarque cet export statique). Rien n'a été déployé ni publié.

> Ce document dit ce qui marche **et** ce qui ne marche pas. Les chiffres viennent
> de mesures, pas d'estimations. Ce qui n'a pas été testé est indiqué comme tel.

---

## 1. Comment l'audit a été mené

| Étape | Outil | Couverture |
|---|---|---|
| Audit statique | lecture du code, scripts d'analyse JSX | 16 écrans, 27 composants |
| Audit automatique | **axe-core 4.x** (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `best-practice`) | **90 analyses** = 15 écrans × 3 thèmes (clair / sombre / fort contraste) × 2 tailles de texte (normale / très grande) |
| Mise en page agrandie | script maison (débordement, contenu hors écran) | **88 contrôles** = 11 écrans × 2 largeurs (360 px, 390 px) × 2 tailles |
| Comportement | script maison (noms accessibles réels, messages d'état, contrastes calculés) | **18 contrôles** |

Deux précautions ont changé les résultats et méritent d'être connues :

1. **Les écrans devaient contenir de vraies données.** Une première passe sur des
   écrans vides ne signalait que 3 problèmes. Une fois les appels à l'API relayés
   (le navigateur les bloquait en local pour cause de CORS), les listes de produits
   se sont remplies et **deux défauts sérieux supplémentaires** sont apparus —
   dont les pastilles Nutri-Score, invisibles tant qu'aucun produit n'est affiché.
2. **Les préférences devaient être réellement appliquées.** L'app ignore le
   réglage sombre du système et pilote thème, contraste et taille depuis sa propre
   clé `prixes.a11y`. Une première passe qui forçait le mode sombre du navigateur
   testait en réalité trois fois le mode clair.

Les scripts sont dans le dossier de travail de la session (`axe-run.mjs`,
`a11y-verify.mjs`, `a11y-zoom.mjs`) et sont rejouables.

---

## 2. Ce qui marchait déjà bien

À dire tel quel : le socle était sérieux avant l'audit.

- **Zoom non bloqué** : `userScalable: true`, `maximumScale: 5` (WCAG 1.4.4).
- **Boîtes de dialogue correctes** : le hook `useDialog` déplace le focus dans la
  boîte, **piège Tab / Maj+Tab**, ferme sur **Échap** et **rend le focus** à
  l'élément d'origine (WCAG 2.1.2, 2.4.3). Utilisé par la connexion, l'assistant
  vocal, les réglages d'accessibilité, la légende des scores, le tour guidé.
- **Lien d'évitement** « Aller au contenu » vers `<main id="contenu">`.
- **Repères** : `<main>`, `<nav aria-label="Navigation principale">`, `role="search"`.
- **Icônes `aria-hidden`** : elles ne polluent pas la lecture — mais cela rend le
  `aria-label` des boutons-icônes obligatoire, et il était presque partout présent.
- **Aucun `tabindex` positif**, aucune `div` cliquable sans rôle.
- **L'information n'est jamais portée par la seule couleur** : chaque Nutri-Score
  a sa phrase (`nutriHint` : « bonne qualité nutritionnelle »…), lue à voix haute.
- **Images** : `alt` pertinent, ou `alt=""` quand elles sont décoratives.
- **Réglages intégrés** : taille du texte (3 crans), fort contraste, mode sombre,
  assistant vocal, lecture automatique, allergènes, régime — tous avec
  `aria-pressed`, dans des `<fieldset>` avec `<legend>`.
- **Plancher typographique à 12 px** (et non 10) : décidé précisément pour les
  personnes qui agrandissent la police système.

---

## 3. Ce qui était cassé — corrigé dans ce commit

### 3.1 Perceptible

| # | Problème | Critère | Gravité | Mesure |
|---|---|---|---|---|
| 1 | « Tout voir » (accueil) : vert accent sur fond de page | 1.4.3 | 🔴 Critique | **1,62:1** en clair, **2,03:1** en sombre, **1,70:1** en fort contraste (exigé 4,5) → **6,19:1** après correction |
| 2 | Pastilles Nutri-Score / Eco-Score / NOVA : texte blanc sur fonds clairs | 1.4.3 | 🔴 Critique | Eco-B **2,29:1**, Eco-D **2,70:1**, Eco-U **4,48:1**, Nutri-E 4,14:1 — 127 occurrences |
| 3 | Liens au fil du texte soulignés seulement au survol (Sources, Confidentialité) | 1.4.1 | 🟡 Majeur | 6 liens |
| 4 | Icônes de section dans la teinte accent illisible | 1.4.11 | 🟢 Mineur | même teinte que #1 |

Pour les pastilles, les couleurs officielles sont **conservées** : c'est l'encre
qui est désormais choisie d'après la luminance du fond (`readableOn()` dans
`lib/format.ts`). Toutes passent au-dessus de 4,5:1 — sauf une, voir §4.

### 3.2 Utilisable

| # | Problème | Critère | Gravité |
|---|---|---|---|
| 5 | À la plus grande taille de texte, l'onglet **« Scanner » sortait de l'écran** sur **toutes** les pages (360 px) | 1.4.10 | 🔴 Critique |
| 6 | Barre du scanner : le bouton **« Chercher » hors écran**, 77 px de débordement | 1.4.10 | 🟡 Majeur |
| 7 | Bandeau « Meilleur prix » et rangée d'étoiles de notation débordaient | 1.4.10 | 🟡 Majeur |
| 8 | Boutons **− / +** de la liste de courses à **28 px** | 2.5.5 (AAA) / 2.5.8 | 🟢 Mineur → passés à 36 px |

Le réglage de taille applique `zoom` sur `<html>` : tout grandit (texte **et**
mise en page), mais un écran de 360 px se comporte alors comme **277 px** — d'où
ces débordements, invisibles à taille normale.

### 3.3 Compréhensible et robuste

| # | Problème | Critère | Gravité |
|---|---|---|---|
| 9 | **Les résultats de recherche arrivaient en silence** : rien n'annonçait « 17 résultats pour nutella ». Idem pour la liste des stations. | 4.1.3 | 🔴 Critique |
| 10 | Marqueurs de la carte : annoncés « bouton », sans nom (Leaflet) | 4.1.2 | 🔴 Critique |
| 11 | Avatar du compte annoncé « AT » | 2.4.4 / 4.1.2 | 🟡 Majeur |
| 12 | Vignette d'une alerte : **second lien sans nom** vers le même produit | 2.4.4 | 🟡 Majeur |
| 13 | Boutons de quantité : dix paires disant toutes « Moins » / « Plus » sans nommer le produit | 2.4.6 | 🟡 Majeur |
| 14 | Champs **Recherche** et **Code-barres** : texte indicatif seulement, qui disparaît à la saisie | 3.3.2 | 🟡 Majeur |
| 15 | « A », « A+ », « A++ » ne disaient pas ce qu'ils réglaient | 4.1.2 | 🟢 Mineur |

Le n° 9 est le plus important pour votre argument : une personne aveugle dictait
sa recherche et **rien ne lui disait que la liste avait changé**.

---

## 4. Ce qui reste — non corrigé, assumé

### 4.1 Rouge officiel du Nutri-Score E : 4,14:1 (exigé 4,5:1)

`#e63e11` avec du blanc donne 4,15:1, avec de l'encre sombre 4,14:1 : **aucune
encre ne passe**. Le corriger impose de toucher à une couleur normalisée.

- Correctif prêt, une ligne dans `lib/format.ts` : `e: "#d83a10"` → **4,63:1**.
  C'est un assombrissement de 6 %, imperceptible à l'œil.
- **C'est votre décision**, pas la mienne : c'est la charte Nutri-Score.
- À dire à la journaliste si la question vient : *« une seule pastille sur cinq
  reste 8 % en dessous du seuil, parce que c'est la couleur officielle ; la note
  est aussi écrite en toutes lettres et lue à voix haute, donc l'information
  n'est jamais perdue. »* — c'est vrai, et vérifiable.

### 4.2 Débordement horizontal à la plus grande taille, sur écran 360 px

Il reste **18 px** sur la recherche et **22 px** sur la fiche produit (sur 360 px),
et le prix « 5,09 € » de la ligne magasin sort du cadre. Sur 390 px (le format le
plus courant) : plus aucun débordement. Correction possible mais elle demande de
revoir la ligne magasin, pas une retouche de classe CSS — hors du périmètre
« simple et sûr » de cet audit.

### 4.3 Points signalés par l'outil mais qui ne sont pas des défauts

- `region` (axe, « best practice ») : le seul élément hors repère est **le lien
  d'évitement lui-même**, qui doit être avant `<main>` par construction.
- Noms de produits tronqués par « … » : le nom complet est dans le `aria-label`
  du lien, donc lu en entier.

### 4.4 Non testé

- **TalkBack** : aucun test réel n'a été fait. Les outils automatiques couvrent
  environ un tiers des critères — voir la checklist ci-dessous.
- **Le scanner de code-barres** (nécessite un vrai produit devant la caméra) et
  **la reconnaissance vocale** n'ont pas été évalués sous TalkBack ; les deux
  lecteurs d'écran et les micros se disputent parfois le canal audio.
- **L'app iOS / VoiceOver** : non testée (pas de Mac, pas de compte Apple).

---

## 5. Checklist de test manuel TalkBack

À faire sur le téléphone, avec **Paramètres → Accessibilité → TalkBack**. Gestes :
glisser à droite = élément suivant, double-tap = activer, glisser vers le haut
puis la droite = menu de lecture.

> Préparez aussi : **taille de police système au maximum** (Paramètres →
> Affichage → Taille de police) — c'est là que se voient les débordements.

### A. Démarrage et navigation

- [ ] Au lancement, l'écran de chargement est annoncé (« Chargement de Prixes »).
- [ ] Les 4 onglets du bas s'annoncent : Accueil, Assistant, Carburant, Scanner —
      **et le libellé « Scanner » est entièrement visible** à la plus grande taille.
- [ ] L'onglet actif est annoncé comme sélectionné.
- [ ] Depuis le haut, on atteint le contenu sans traverser dix éléments.

### B. Recherche — le parcours principal

- [ ] Le champ s'annonce **« Rechercher un produit »** (et pas seulement son texte gris).
- [ ] Après une recherche, TalkBack annonce **« N résultats pour … »** sans qu'on
      ait à explorer l'écran. ← *le correctif le plus important*
- [ ] Chaque carte produit se lit d'un bloc : nom, marque, prix, enseigne,
      distance, Nutri-Score **et sa signification en toutes lettres**.
- [ ] Le bouton « Ajouter » est atteignable séparément de la carte.

### C. Fiche produit

- [ ] Le prix et le prix au kilo sont annoncés.
- [ ] « Voir sur la carte » et « Itinéraire » s'annoncent distinctement, et
      l'ouverture dans une nouvelle fenêtre est signalée.
- [ ] Les pastilles Nutri / Eco / NOVA sont lisibles à l'œil **et** annoncées.

### D. Liste de courses

- [ ] Chaque bouton de quantité dit **« Retirer un <produit> »** /
      **« Ajouter un <produit> »**, jamais « Moins » tout court.
- [ ] La quantité est annoncée « Quantité : 3 ».
- [ ] Les boutons 36 px restent atteignables au doigt.

### E. Carburant et magasins

- [ ] Après « Trouver les stations proches », TalkBack annonce **« N stations trouvées »**.
- [ ] Chaque station : nom, ville, distance, prix.
- [ ] Sur la carte, les marqueurs s'annoncent avec **le nom du magasin**, pas « bouton ».
- [ ] Si la position est refusée puis acceptée, **aucun message d'erreur ne reste** affiché.

### F. Réglages d'accessibilité et voix

- [ ] Le bouton d'accessibilité s'annonce « Options d'accessibilité ».
- [ ] À l'ouverture, le focus entre dans le panneau ; **Échap / retour le ferme**
      et rend le focus au bouton.
- [ ] Les trois tailles s'annoncent **« Taille normale / Grande taille / Très
      grande taille »**, avec l'état coché.
- [ ] « Fort contraste » annonce son état activé/désactivé.
- [ ] L'assistant vocal : vérifier que **TalkBack et la dictée ne se coupent pas
      la parole** (point à surveiller, non testé).

### G. Connexion

- [ ] La boîte de connexion s'annonce comme fenêtre ; le focus y entre.
- [ ] Les champs Email et Mot de passe sont nommés.
- [ ] Une erreur de connexion est **annoncée** (elle est en `role="alert"`).
- [ ] L'avatar en haut à droite s'annonce **« Mon compte »**, pas « AT ».

### H. Ce qu'il faut regarder à la plus grande taille

- [ ] Sur un petit écran (360 px), la recherche et la fiche produit peuvent
      demander un léger défilement horizontal (~20 px) — défaut connu, §4.2.
- [ ] Aucun bouton n'est coupé sur les autres écrans.

---

## 6. Résumé pour l'interview

**Ce qui est vrai et défendable :**
- Tous les contrôles de toutes les pages ont un nom lu à voix haute (18/18 vérifiés).
- Les résultats de recherche et de stations sont annoncés automatiquement.
- Trois tailles de texte, fort contraste, mode sombre, assistant vocal, lecture
  des prix, avertissement allergènes — intégrés à l'app, pas dépendants du système.
- Le zoom n'est jamais bloqué ; les fenêtres respectent le clavier et Échap.
- La couleur ne porte jamais seule l'information : chaque score est aussi écrit.

**Ce qu'il faut dire honnêtement :**
- L'audit automatique couvre environ un tiers des critères ; **le test TalkBack
  réel reste à faire** (checklist ci-dessus).
- Une pastille sur cinq (Nutri-Score E) reste légèrement sous le seuil de
  contraste, parce que c'est la couleur officielle.
- Sur les plus petits écrans, au réglage de texte maximal, il reste un léger
  défilement horizontal sur deux écrans.
- iOS / VoiceOver n'a pas encore été évalué.
