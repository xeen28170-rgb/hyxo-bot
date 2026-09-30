<div align="center">

# 🛡️ Xeen

**Le bot Discord tout-en-un pour protéger et gérer votre serveur.**
Modération · Antiraid · Tickets · Backups · Giveaways · Vocaux temporaires

[![Inviter Xeen](https://img.shields.io/badge/➕_Inviter_Xeen-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/oauth2/authorize?client_id=CLIENT_ID_ICI&scope=bot+applications.commands&permissions=8)
[![Serveur support](https://img.shields.io/badge/💬_Support-2B2D31?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/LIEN_SUPPORT_ICI)

[![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2)](https://discord.js.org)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D18-339933)](https://nodejs.org)

</div>

---

## ✨ Pourquoi Xeen ?

- **Plus de 140 commandes** en français et en anglais, prêtes à l'emploi.
- **Une vraie protection antiraid** : seuls les owners et la whitelist échappent aux sanctions.
- **Tout se configure depuis Discord** avec des menus, des boutons et des embeds. Aucun panel web à gérer.
- **Gratuit.**

## 🧰 Fonctionnalités

| | Module | Ce qu'il fait |
|---|---|---|
| 🛡️ | **Antiraid & sécurité** | Bloque les créations/suppressions massives de salons, rôles, webhooks, bans et l'ajout de bots. Mode lockdown, anti-derank, anti-comptes récents, whitelist. |
| 🤖 | **Automod** | Anti-liens, anti-spam, anti-mentions de masse, filtre d'insultes, système de strikes avec sanctions automatiques. |
| 🔨 | **Modération** | Ban, tempban, kick, mute vocal & texte, timeout, warns, prison, derank, lock/hide de salons, historique des sanctions. |
| 🎫 | **Tickets & modmail** | Panels interactifs, prise en charge par le staff, transcriptions HTML. |
| 💾 | **Backups** | Sauvegardez la structure de votre serveur et restaurez-la en un clic, avec backups automatiques. |
| 🎉 | **Giveaways** | Concours avec conditions, reroll et tirage au sort. |
| 🎤 | **Vocaux temporaires** | Chaque membre crée et gère son propre salon vocal. |
| 📊 | **Logs & statistiques** | Logs détaillés (messages, membres, rôles, salons, boosts) et salons de statistiques. |
| ⚙️ | **Personnalisation** | Préfixe, permissions par commande, commandes personnalisées, rolemenus, embeds, formulaires. |

## 🚀 Démarrage rapide

1. **[Invitez Xeen](https://discord.com/oauth2/authorize?client_id=CLIENT_ID_ICI&scope=bot+applications.commands&permissions=8)** sur votre serveur.
2. Tapez `-help` pour afficher le menu des commandes.
3. Configurez la sécurité avec `-secur`.

Besoin d'aide ? Tapez `-support` ou rejoignez le [serveur support](https://discord.gg/LIEN_SUPPORT_ICI).

---

## 🖥️ Hébergement (usage interne)

### Prérequis
- [Node.js](https://nodejs.org/) v18.17 ou supérieur.

### Installation
```bash
git clone https://github.com/blackdream3766/Xeen-Bot.git
cd Xeen-Bot
npm install
```

### Configuration
Créez un fichier `.env` à la racine :
```env
TOKEN=token_du_bot
OWNER_IDS=votre_id,autre_id
PREFIX=-
DEFAULT_LANGUAGE=fr
SUPPORT_URL=https://discord.gg/votre_serveur
```

### Lancement
```bash
npm start          # production
npm run dev        # développement (redémarrage auto)
npm run shard      # sharding pour les gros bots
```

Sur un VPS, utilisez [pm2](https://pm2.keymetrics.io/) pour garder le bot en ligne :
```bash
pm2 start index.js --name xeen && pm2 save && pm2 startup
```

## 📂 Structure du projet

```text
src/
  commands/   Commandes par catégorie
  events/     Événements Discord
  handlers/   Chargement des commandes, événements et langues
  services/   Logique métier (antiraid, automod…)
  models/     Stockage JSON
  languages/  Traductions FR / EN
index.js      Point d'entrée
shard.js      Gestionnaire de sharding
```

## 🔒 Code source

Le code de Xeen est **privé**. Ne partagez jamais ce dépôt ni le fichier `.env`.
