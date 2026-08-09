# 🛡️ Gestions Bot — Open Source Discord Bot

[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org)
[![Node.js](https://img.shields.io/badge/node.js->=18-green.svg)](https://nodejs.org)

**Gestions** est un bot Discord open source complet et professionnel, offrant des outils avancés de modération, de sécurité antiraid, de gestion de tickets, et d'automatisation.

---

## ✨ Fonctionnalités Principales

- 🛡️ **Modération Avancée** : Ban, Kick, Mute (vocal & texte), Warns, Clear, Derank.
- ⚡ **Antiraid & Sécurité** : Protection contre les spams de salons, rôles, webhooks, bans, et bots.
- 🤖 **Automod** : Détection automatique des liens, spams, insultes et mentions massives.
- 🎫 **Système de Tickets** : Panels interactifs, transcriptions HTML, prise en charge par le staff.
- 💾 **Sauvegarde (Backup)** : Sauvegardez et restaurez la structure de votre serveur en un clic.
- 🎤 **Temp Voice** : Salons vocaux temporaires personnalisables par les utilisateurs.
- 🎉 **Giveaway** : Système de concours robuste avec reroll et conditions.
- 🌐 **Multilingue** : Support complet du Français (FR) et de l'Anglais (EN).

---

## 🚀 Installation

### 1. Prérequis
- [Node.js](https://nodejs.org/) v18 ou supérieur.

### 2. Clonage et Dépendances
```bash
git clone https://github.com/votre-repo/gestions-bot.git
cd gestions-bot
npm install
```

### 3. Configuration
Copiez le fichier `.env.example` en `.env` et remplissez les variables :
```env
TOKEN=votre_bot_token
CLIENT_ID=id_du_bot
OWNER_IDS=votre_id,autre_id
```

### 4. Lancement
```bash
# Mode Développement
npm run dev

# Mode Production
npm start

# Mode Sharding (pour les gros bots)
npm run shard
```

---

## 📂 Structure du Projet

```text
/src
  /commands     # Commandes organisées par catégories
  /events       # Gestionnaires d'événements Discord
  /handlers     # Loaders (Commandes, Événements, Langues)
  /models       # Schémas de données (JSON)
  /services     # Logique métier (Antiraid, Automod, etc.)
  /utils        # Utilitaires (Embeds, Permissions, Logger)
  /languages    # Fichiers de traduction JSON
index.js        # Point d'entrée principal
shard.js        # Gestionnaire de sharding
```

---

## 🛠️ Technologies
- **Langage** : JavaScript (Node.js)
- **Framework Bot** : Discord.js v14
- **Stockage** : JSON (Système de fichiers)
- **Logs** : Winston (Rotation quotidienne)

---

## 📜 Licence
Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.
