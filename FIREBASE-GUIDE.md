# 🔥 Guide d'installation Firebase — Prixes

> Temps estimé : 15-20 minutes
> Coût : 0 € (plan gratuit Spark)

---

## Étape 1 — Créer le projet Firebase

1. Allez sur https://console.firebase.google.com/
2. Cliquez **"Créer un projet"**
3. Nom du projet : **prixes**
4. Désactivez Google Analytics (optionnel pour l'instant)
5. Cliquez **"Créer le projet"**

---

## Étape 2 — Activer l'authentification

1. Dans le menu gauche → **Authentication** → **Commencer**
2. Onglet **"Sign-in method"**
3. Activez :
   - **Email/Mot de passe** → Activer → Enregistrer
   - **Google** → Activer → Entrez un email de support → Enregistrer

---

## Étape 3 — Créer la base de données Firestore

1. Dans le menu gauche → **Firestore Database** → **Créer une base de données**
2. Choisissez **"Démarrer en mode production"**
3. Emplacement : **eur3 (europe-west)** (données en Europe)
4. Cliquez **"Activer"**
5. Allez dans **Règles** → Copiez le contenu du fichier `firestore.rules` → **Publier**

---

## Étape 4 — Activer le Storage (photos)

1. Dans le menu gauche → **Storage** → **Commencer**
2. Choisissez **"Démarrer en mode production"**
3. Emplacement : **europe-west3** (Frankfurt, RGPD)
4. Allez dans **Règles** → Copiez le contenu du fichier `storage.rules` → **Publier**

---

## Étape 5 — Récupérer les clés de configuration

1. Dans la console Firebase → ⚙️ **Paramètres du projet** (engrenage en haut à gauche)
2. Faites défiler vers le bas → **"Vos applications"**
3. Cliquez **"</> Web"** (ajouter une app web)
4. Nom de l'app : **prixes-web**
5. Ne cochez **pas** "Configurer Firebase Hosting"
6. Cliquez **"Enregistrer l'application"**
7. Vous verrez un objet `firebaseConfig` comme ceci :

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "prixes-xxxxx.firebaseapp.com",
  projectId: "prixes-xxxxx",
  storageBucket: "prixes-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

## Étape 6 — Configurer index.html

1. Ouvrez `index.html` dans un éditeur de texte (Notepad, VS Code...)
2. Cherchez ce bloc (vers le début du JavaScript) :

```javascript
const FIREBASE_CONFIG = {
  apiKey:            "VOTRE_API_KEY",
  authDomain:        "VOTRE_PROJECT_ID.firebaseapp.com",
  projectId:         "VOTRE_PROJECT_ID",
  storageBucket:     "VOTRE_PROJECT_ID.appspot.com",
  messagingSenderId: "VOTRE_SENDER_ID",
  appId:             "VOTRE_APP_ID"
};
```

3. Remplacez chaque valeur par les vôtres. Exemple :

```javascript
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain:        "prixes-12345.firebaseapp.com",
  projectId:         "prixes-12345",
  storageBucket:     "prixes-12345.appspot.com",
  messagingSenderId: "987654321098",
  appId:             "1:987654321098:web:abcdef123456"
};
```

4. Sauvegardez le fichier.

---

## Étape 7 — Déployer sur Netlify

1. Allez sur https://app.netlify.com/
2. Ouvrez votre site Prixes → **Deploys**
3. Faites glisser le dossier `prixes-deploy` mis à jour dans la zone de déploiement
4. Attendez 20 secondes → votre site est mis à jour

---

## Étape 8 — Autoriser votre domaine Netlify

1. Dans Firebase Console → **Authentication** → **Paramètres** → **Domaines autorisés**
2. Cliquez **"Ajouter un domaine"**
3. Ajoutez : `prixes.netlify.app`
4. (Si vous avez un domaine personnalisé, l'ajouter aussi)

---

## Étape 9 — Tester

1. Ouvrez https://prixes.netlify.app/
2. Cliquez **"Se connecter"** → créez un compte
3. Cliquez **"➕ Poster"** → publiez un deal test
4. Rechargez la page → le deal doit toujours être là ✅
5. Ouvrez depuis un autre appareil → le deal doit apparaître ✅

---

## Structure de la base de données Firestore

```
prixes-firestore/
├── deals/                    ← Tous les deals partagés
│   └── {dealId}/
│       ├── authorId          (uid de l'auteur)
│       ├── author            (prénom/pseudo)
│       ├── ini               (initiales pour l'avatar)
│       ├── title             (titre du deal)
│       ├── store             (enseigne)
│       ├── priceNow          (prix réduit)
│       ├── priceBefore       (prix habituel)
│       ├── vOui              (votes positifs)
│       ├── vNon              (votes négatifs)
│       ├── photo             (URL Storage, optionnel)
│       ├── link              (lien vers l'offre)
│       └── createdAt         (timestamp)
│
├── votes/                    ← Les votes des utilisateurs
│   └── {userId}_{dealId}/
│       ├── userId
│       ├── dealId
│       └── type              ('oui' ou 'non')
│
└── users/                    ← Profils utilisateurs
    └── {userId}/
        ├── username
        ├── ini
        ├── email
        ├── rep               (points de réputation)
        ├── dealsCount        (nombre de deals postés)
        └── totalVotes        (votes reçus total)
```

---

## Plan gratuit Firebase (Spark)

| Ressource | Limite gratuite |
|-----------|----------------|
| Firestore lectures | 50 000/jour |
| Firestore écritures | 20 000/jour |
| Firestore stockage | 1 Go |
| Storage | 5 Go |
| Auth utilisateurs | Illimité |
| Bande passante | 10 Go/mois |

**Pour Prixes en démarrage : largement suffisant jusqu'à ~5 000 utilisateurs actifs.**

---

## En cas de problème

- Console du navigateur (F12 → Console) → cherchez les messages `[Prixes]`
- `[Prixes] Firebase non configuré` → les clés ne sont pas encore remplies
- `auth/unauthorized-domain` → votre domaine n'est pas dans Authentication → Domaines autorisés
- `PERMISSION_DENIED` → vérifiez les règles Firestore/Storage

---

*Guide créé pour Prixes v3.5 — Juin 2025*
