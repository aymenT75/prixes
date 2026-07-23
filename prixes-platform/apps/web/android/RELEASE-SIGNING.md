# Signature de la version Play Store (Android)

⚠️ **La clé de signature est définitive.** Une fois l'app publiée sur le Play Store avec
un keystore, tu ne peux plus jamais en changer. Le **perdre** = ne plus jamais pouvoir
mettre à jour l'app. Le **divulguer** = quelqu'un peut publier de fausses mises à jour.
→ Garde le fichier `.keystore` ET son mot de passe dans **KeePass** (et une copie hors
ligne). Ils ne sont jamais commités (`.gitignore` les exclut).

## 1. Générer le keystore (une seule fois, par TOI)

Dans un terminal, depuis `prixes-platform/apps/web/android/` :

```
keytool -genkeypair -v \
  -keystore prixes-release.keystore \
  -alias prixes \
  -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` te demandera :
- **un mot de passe de keystore** → invente-en un fort, colle-le dans KeePass ;
- nom, organisation, ville, pays → ce que tu veux (visible dans le certificat) ;
- un mot de passe de clé → **mets le même** que le keystore (plus simple).

Un fichier `prixes-release.keystore` apparaît. **Sauvegarde-le dans KeePass** (pièce
jointe) et garde une copie ailleurs.

## 2. Créer `keystore.properties`

Toujours dans `android/`, crée un fichier `keystore.properties` (git-ignoré) :

```
storeFile=prixes-release.keystore
storePassword=TON_MOT_DE_PASSE
keyAlias=prixes
keyPassword=TON_MOT_DE_PASSE
```

## 3. Construire l'AAB signé (le format du Play Store)

Depuis `android/` :

```
./gradlew bundleRelease
```

Résultat : `app/build/outputs/bundle/release/app-release.aab` — c'est le fichier à
téléverser sur le Play Console.

## Notes

- Le `build.gradle` signe automatiquement dès que `keystore.properties` existe ; sinon la
  version release reste non signée (utile pour la CI et les clones frais).
- **Play App Signing** (recommandé par Google) : au premier téléversement, Google propose
  de gérer une clé d'app pour toi ; ta clé ci-dessus devient la « clé de téléversement ».
  Même avec ça, ne perds pas ta clé de téléversement.
- Pour chaque nouvelle version publiée, incrémente `versionCode` dans `app/build.gradle`.
