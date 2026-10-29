# KSTV mobile : feuille de route de parité

Point de départ : IPTVnator 0.25.0. Sur Android et LG, l'appli tourne dans le
**runtime navigateur** (`RuntimeCapabilitiesService.isPwa`). Tout ce que la PWA
sait faire fonctionne donc dès la v0.1. Ce qui passait par Electron (SQLite, worker EPG,
MPV, système de fichiers) est à porter vers des équivalents natifs.

Légende : ✅ fonctionne en v0.1 · 🟡 partiel / à vérifier sur appareil · ⏳ à porter · ➖ sans objet sur mobile

## Sources et lecture

| Fonction | Android | Android TV | LG webOS | Notes |
|---|---|---|---|---|
| M3U par URL | ✅ | ✅ | 🟡 | webOS : vérifier le CORS des fournisseurs |
| M3U fichier local / texte | ✅ | 🟡 | 🟡 | TV : pas de sélecteur de fichiers pratique, préférer l'URL |
| User-Agent par playlist | ✅ | ✅ | ⏳ | webOS : `fetch` ne peut pas changer le User-Agent |
| Xtream Codes (live, VOD, séries) | ✅ | ✅ | 🟡 | |
| Stalker / Ministra | ✅ | ✅ | ⏳ | Il faut les en-têtes Cookie / SN : HTTP natif requis (service Luna côté LG) |
| Lecteur HTML5 (hls.js / Video.js) | ✅ | ✅ | ✅ | |
| Flux MPEG-TS (mpegts.js) | 🟡 | 🟡 | 🟡 | Dépend du support MSE de la WebView |
| Radio | ✅ | ✅ | ✅ | |
| Lecteur natif (ExoPlayer) | ⏳ | ⏳ | ➖ | v0.3 : plugin Capacitor, plus robuste sur les box TV bas de gamme |
| MPV / VLC externes, MPV embarqué | ➖ | ➖ | ➖ | Remplacés par « Ouvrir avec… » (intent Android) en v0.3 |

## TV, EPG, catalogue

| Fonction | Android | Android TV | LG webOS | Notes |
|---|---|---|---|---|
| EPG Xtream (short EPG via l'API) | ✅ | ✅ | 🟡 | |
| EPG XMLTV (guide, grille, timeline) | ⏳ | ⏳ | ⏳ | Desktop seul aujourd'hui (worker SQLite). v0.2 : import en IndexedDB |
| Catch-up / timeshift | ⏳ | ⏳ | ⏳ | Dépend de l'EPG |
| Recherche globale | ⏳ | ⏳ | ⏳ | Desktop seul (SQLite) |
| Favoris, historique, reprise | ✅ | ✅ | ✅ | IndexedDB |
| TMDB (détails, casting, similaires) | ✅ | ✅ | ✅ | Clé TMDB perso |
| Téléchargements hors ligne | ⏳ | ➖ | ➖ | v0.3 : plugin Filesystem / DownloadManager |
| Contrôle parental | 🟡 | 🟡 | 🟡 | Le filtre SQLite est desktop seul |
| Sauvegarde / restauration | ✅ | ✅ | ✅ | Export JSON |

## Ergonomie appareil

| Fonction | Android | Android TV | LG webOS | Notes |
|---|---|---|---|---|
| Bouton Retour | ✅ | ✅ | ✅ | Ferme d'abord dialogue / menu, puis historique, puis quitte |
| Navigation télécommande (D-pad) | ➖ | ⏳ | ⏳ | v0.2 : navigation spatiale (flèches) + focus visible |
| Mise en page TV (10 pieds) | ➖ | ⏳ | ⏳ | Classe `kstv-tv` posée sur `<html>`, styles à écrire |
| Écran allumé pendant la lecture | 🟡 | 🟡 | ✅ | Wake Lock dans la WebView, à vérifier |
| Image dans l'image (PiP) | ⏳ | ➖ | ➖ | |
| APK signé (release) + Play Store | ⏳ | ⏳ | ➖ | Keystore dans les secrets GitHub |
| LG Content Store | ➖ | ➖ | ⏳ | Soumission LG Seller Lounge |

## Prochaines étapes

1. **v0.1 (cette version)** : coques Android et webOS, backend embarqué
   (M3U, Xtream, Stalker), bouton Retour, icônes KSTV, builds automatiques.
2. **v0.2** : navigation télécommande + styles TV, EPG XMLTV en IndexedDB,
   Stalker et User-Agent sur LG.
3. **v0.3** : lecteur natif ExoPlayer, téléchargements, « Ouvrir avec… », PiP.
4. **v1.0** : APK signé, publication Play Store / LG Content Store.
