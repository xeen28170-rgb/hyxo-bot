# 🚀 Guide de démarrage rapide

## 1. Installer les dépendances

```bash
npm install
```

## 2. Préparer l'environnement

Copie `.env.example` vers `.env`, puis renseigne au minimum:

```env
TOKEN=votre_token_discord
CLIENT_ID=votre_client_id
OWNER_IDS=votre_id_discord
PREFIX=+
DEFAULT_LANGUAGE=fr
```

## 3. Lancer le bot

```bash
npm start
```

Pour le développement:

```bash
npm run dev
```

## 4. Vérifier que tout démarre

Tu dois voir dans les logs que:

```text
Cache initialisé
Handlers chargés
Connexion à Discord...
```

## Conseils

- Vérifie que les intents nécessaires sont activés sur le portail Discord Developers.
- Si tu modifies beaucoup de commandes, relance `npm run lint` puis `npm test`.
- Le projet utilise des fichiers JSON dans `data/` pour stocker la configuration.
