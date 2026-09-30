# Emojis du bot — pack Xeen 3D

Les images de ce dossier sont **générées** par `scripts/generateEmojis.js`
(pictogrammes Tabler Icons, licence MIT, mis en relief 3D : dégradé,
extrusion, ombre, reflet et halo). Ne les modifie pas à la main.

## Modifier / ajouter un emoji

1. Édite `MANIFEST` dans `scripts/generateEmojis.js` (clé → icône Tabler + couleur).
2. Ajoute la clé dans `EMOJIS` et `FALLBACK` de `src/config/emojis.js`.
3. Régénère puis upload :

```bash
node scripts/generateEmojis.js
node scripts/uploadEmojis.js
```

L'upload crée des "Application Emojis" (nommés `x_<clé>`, propres au bot)
et écrit leurs IDs dans `src/config/emojis.js`. Un emoji déjà présent sous
le même nom est réutilisé : pour changer son image, supprime-le d'abord
dans le Developer Portal (onglet Emojis de l'application).
