# Emojis du bot

Dépose ici les images des emojis personnalisés du bot.

## Règles de nommage

Le nom du fichier (sans extension) doit correspondre à une clé de
`src/config/emojis.js`, **en minuscule**. Exemples :

- `ban.png`      → remplit la clé `BAN`
- `success.png`  → remplit la clé `SUCCESS`
- `ticket.gif`   → remplit la clé `TICKET` (animé, format `.gif` accepté)

Formats acceptés : `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`
Taille conseillée : 256x256px, max 256 Ko.

## Upload

Une fois tes images placées ici :

```bash
node scripts/uploadEmojis.js
```

Le script upload chaque image comme "Application Emoji" (propre au bot,
utilisable sur tous les serveurs) et met à jour automatiquement
`src/config/emojis.js` avec les IDs générés.

Relancer le script plus tard ne re-upload pas les emojis déjà présents.
