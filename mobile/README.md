# KSTV — applis mobiles et TV

Le même code Angular (`apps/web`) tourne dans trois coques :

| Cible | Coque | Fichier produit |
|---|---|---|
| Android téléphone / tablette | Capacitor (`mobile/android`) | `kstv-android-debug.apk` |
| Android TV / Google TV / box | même APK (lanceur TV + bannière) | `kstv-android-debug.apk` |
| LG TV (webOS) | paquet web (`mobile/webos`) | `com.koyaja.kstv_<version>_all.ipk` |

## Comment ça marche

L'appli web tourne en mode « navigateur » (PWA), mais sans serveur : la couche
`apps/web/src/app/mobile/` répond elle-même aux routes que la PWA envoie
normalement au `web-backend` (`/parse`, `/xtream`, `/stalker`…).

- **Android** : les requêtes partent via le HTTP natif de Capacitor. Il n'y a pas
  de CORS, et les en-têtes Cookie / User-Agent exigés par les portails Stalker passent.
- **webOS** : les requêtes passent par `fetch`.
- Les données (playlists, favoris, positions) restent en IndexedDB sur l'appareil.

## Récupérer les applis (sans rien installer)

Chaque push sur `main` lance le workflow **KSTV mobile**. Ouvrez le run dans
l'onglet *Actions* du dépôt, puis téléchargez les fichiers de la section *Artifacts*.

### Installer l'APK
- **Téléphone** : ouvrez l'APK et autorisez « sources inconnues ».
- **Android TV** : installez *Downloader* (ou *Send Files to TV*), puis transférez et
  ouvrez l'APK. Autre option : `adb connect <ip-tv> && adb install kstv-android-debug.apk`.

### Installer sur LG TV (webOS)
1. Sur la TV, installez l'appli **Developer Mode** (LG Content Store) et activez-la
   (compte LG développeur gratuit).
2. Sur le PC : `npm i -g @webos-tools/cli`
3. `ares-setup-device` : ajoutez la TV (IP + passphrase affichée par Developer Mode).
4. `ares-install --device <nom> com.koyaja.kstv_0.1.0_all.ipk`

Le mode développeur LG expire au bout de 50 h, sauf si vous cliquez sur
« Extend » dans l'appli Developer Mode.

## Builder en local

```bash
# racine du dépôt
pnpm install --frozen-lockfile
pnpm nx build web --configuration=production

cd mobile
npm ci
npx cap sync android
cd android && ./gradlew assembleDebug     # JDK 21 + Android SDK
cd .. && npm run webos:package            # .ipk LG
```

Ouvrir dans Android Studio : `cd mobile && npx cap open android`.

Régénérer les icônes : `python3 mobile/branding/generate_icons.py` (Pillow).

## Limites connues (v0.1)

Voir [docs/kstv/feuille-de-route-mobile.md](../docs/kstv/feuille-de-route-mobile.md).
