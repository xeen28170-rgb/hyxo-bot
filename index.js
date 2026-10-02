
'use strict';

require('dotenv').config();

// Un seul processus peut posseder les caches et fichiers JSON du bot.
const releaseInstanceLock = require('./src/utils/instanceLock').acquireInstanceLock(require('path').join(__dirname, 'data'));
process.once('exit', releaseInstanceLock);

const { Client, GatewayIntentBits, Partials, Collection, Options } = require('discord.js');

const Logger = require('./src/utils/logger');
const HandlerLoader = require('./src/handlers/handlerLoader');
const AntiCrash = require('./src/utils/antiCrash');
const CacheManager = require('./src/cache/cacheManager');
const ModelRegistry = require('./src/utils/modelRegistry');
const Owner = require('./src/models/Owner');
const Guild = require('./src/models/Guild');

const fs = require('fs');
const path = require('path');

const client = new Client({
    // Caches de fonctionnalités jamais utilisées : moins de mémoire et de travail.
    makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        StageInstanceManager: 0,
        GuildScheduledEventManager: 0,
        AutoModerationRuleManager: 0,
        ThreadMemberManager: 0,
        GuildInviteManager: 0,
        GuildStickerManager: 0,
    }),
    // Seuls les intents réellement utilisés : chaque intent en trop fait recevoir
    // et traiter des événements inutiles (ex: « est en train d'écrire »).
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.GuildMember,
        Partials.Reaction,
    ],
    sweepers: {
        messages: {
            interval: 300,
            lifetime: 1800,
        },
        users: {
            interval: 600,
            filter: () => user => Boolean(user) && !user.bot,
        },
    },
    allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: false,
    },
    rest: {
        timeout: 15000,
        retries: 3,
    },
});

// Rendu « panneau moderne » (Components V2) + emojis Hyxo pour tous les messages.
require('./src/utils/componentsV2').install(client);

client.commands = new Collection();
client.aliases = new Collection();
client.cooldowns = new Collection();
client.events = new Collection();
client.guildSettings = new Collection();
client.antiRaidCache = new Collection();
client.spamCache = new Collection();
client.tempVoice = new Collection();
client.giveaways = new Collection();
client.tickets = new Collection();
client.musicQueues = new Collection();
client.locks = new Collection();
client.boostLogCache = new Collection();

client.botOwners = new Set(
    (process.env.OWNER_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
);

client.owners = new Set(client.botOwners);

client.prefix = process.env.PREFIX || '-';
client.defaultLanguage = process.env.DEFAULT_LANGUAGE || 'fr';
client.version = require('./package.json').version;
client.startTime = Date.now();
client.cache = new CacheManager();

function validateEnvironment() {
    const missing = [];
    if (!process.env.TOKEN?.trim()) missing.push('TOKEN');

    const nodeMajor = Number(process.versions.node.split('.')[0]);
    if (nodeMajor < 18) {
        Logger.error(`[CONFIG] Node.js ${process.version} détecté. Le bot nécessite Node.js 18 ou plus.`);
        return false;
    }

    if (missing.length) {
        Logger.error(`[CONFIG] Variable(s) manquante(s): ${missing.join(', ')}`);
        Logger.error('[CONFIG] Ajoute-les dans le fichier .env ou dans les variables Pterodactyl.');
        return false;
    }

    return true;
}

// Nettoie les fichiers temporaires orphelins laissés par une écriture atomique
// interrompue (process tué entre `writeFile` et `rename`). Leur nom suit le schéma
// `.{basename}.{pid}.{timestamp}.{counter}.tmp` produit par jsonStore.
function purgeOrphanTempFiles() {
    const dataDir = path.join(process.cwd(), 'data');
    let removed = 0;
    try {
        if (!fs.existsSync(dataDir)) return;
        const entries = fs.readdirSync(dataDir);
        for (const entry of entries) {
            if (!entry.endsWith('.tmp')) continue;
            try {
                const file = path.join(dataDir, path.basename(entry));
                fs.unlinkSync(file);
                removed++;
            } catch { /* fichier verrouillé ou déjà supprimé : on ignore */ }
        }
    } catch (err) {
        Logger.error('[CONFIG] Erreur nettoyage des fichiers temporaires:', err.message);
        return;
    }
    if (removed > 0) Logger.info(`[CONFIG] ${removed} fichier(s) temporaire(s) orphelin(s) nettoyé(s).`);
}

async function initialize() {
    // Ne pas effacer la console hors terminal interactif (ex: Pterodactyl/PM2),
    // sinon on perd des logs de démarrage utiles.
    if (process.stdout.isTTY) console.clear();
    Logger.banner();

    try {
        if (!validateEnvironment()) {
            process.exit(1);
        }

        // Nettoie les fichiers temporaires orphelins (écritures atomique interrompues)
        // laissés dans le dossier data lors d'un arrêt brutal du process.
        purgeOrphanTempFiles();

        Logger.info('Initialisation du cache...');
        await client.cache.init();
        const [persistedOwners, storedGuilds] = await Promise.all([
            Owner.find(),
            Guild.find(),
        ]);
        const guildSettings = await Promise.all(
            storedGuilds.map(settings => Guild.getOrCreate(settings.guildId))
        );
        for (const owner of persistedOwners) {
            if (owner?.userId) client.owners.add(owner.userId);
        }
        for (const settings of guildSettings) {
            if (settings?.guildId) client.cache.setGuild(settings.guildId, settings);
        }
        Logger.success(`Cache initialisé (${guildSettings.length} serveur(s) préchargé(s))`);

        Logger.info('Chargement des handlers...');
        const loader = new HandlerLoader(client);
        await loader.loadAll();
        Logger.success('Handlers chargés');

        Logger.info('Connexion à Discord...');
        await client.login(process.env.TOKEN);

    } catch (error) {
        Logger.error('Erreur fatale lors de l\'initialisation:', error);
        process.exit(1);
    }
}

AntiCrash.init(client);

// Graceful shutdown: flush all pending JSON saves BEFORE destroying the client.
// Handler unique (antiCrash n'enregistre plus SIGINT/SIGTERM) pour garantir que
// les sauvegardes en attente sont écrites de façon synchrone et atomique avant
// de quitter — sinon les dernières modifications (debounce 500ms) seraient perdues.
let shuttingDown = false;
function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    Logger.info(`[SHUTDOWN] Signal ${signal} reçu. Sauvegarde des données en attente...`);
    try {
        ModelRegistry.flushAll();
    } catch (error) {
        Logger.error('[SHUTDOWN] Erreur lors du flush final:', error);
    }
    try {
        if (client?.destroy) client.destroy();
    } catch { /* le client n'est peut-être pas encore connecté */ }
    process.exit(0);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

initialize();

module.exports = client;
