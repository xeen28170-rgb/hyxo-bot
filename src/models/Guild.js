'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const GUILDS_FILE = path.join(DATA_DIR, 'guilds.json');

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = {};
let isLoaded = false;
const normalizedGuilds = new Set();

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(GUILDS_FILE)) {
            const raw = await fs.readFile(GUILDS_FILE, 'utf8');
            store = JSON.parse(raw);
            for (const guild of Object.values(store)) {
                if (guild.createdAt) guild.createdAt = new Date(guild.createdAt);
                if (guild.updatedAt) guild.updatedAt = new Date(guild.updatedAt);
            }
        }
    } catch (e) {
        const Logger = require('../utils/logger');
        Logger.error('[Guild] Erreur chargement guilds.json:', e.message);
        store = {};
    }
    isLoaded = true;
}

let saveTimeout = null;
function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    // Register a synchronous fallback for graceful shutdown
    ModelRegistry.register(GUILDS_FILE, () =>
        writeJsonSync(GUILDS_FILE, store)
    );
    saveTimeout = setTimeout(async () => {
        try {
            await writeJson(GUILDS_FILE, store);
            ModelRegistry.unregister(GUILDS_FILE);
        } catch (e) {
            const Logger = require('../utils/logger');
            Logger.error('[Guild] Erreur sauvegarde guilds.json:', e.message);
        }
    }, 500);
}

function makeDefault(guildId) {
    return {
        guildId,
        prefix: '-',
        language: 'fr',
        logs: {
            enabled: false, channel: null, modLogs: null, messageLogs: null,
            voiceLogs: null, roleLogs: null, boostLogs: null, joinLogs: null,
            leaveLogs: null, webhookLogs: null, raidLogs: null, ticketLogs: null, securityLogs: null,
            channelLogs: null, serverLogs: null, warnLogs: null, banLogs: null,
            kickLogs: null, muteLogs: null, unmuteLogs: null, timeoutLogs: null,
            giveawayLogs: null, errorLogs: null,
            ignoredChannels: [], ignoredRoles: []
        },
        moderation: {
            muteRole: null, autoDehoistEnabled: false, autoModEnabled: false,
            useTimeout: false, publicCommands: true, restrictedChannels: [], noDerank: []
        },
        prison: {
            enabled: false, roleId: null, categoryId: null, jailChannelId: null, voiceChannelId: null,
            prisoners: [],
            notifyDM: { enabled: false, message: '', releaseMessage: '' }
        },
        antiraid: {
            enabled: false, raidPingRole: null, antichannel: 'off', antirole: 'off',
            antiwebhook: 'off', antiban: 'off', antikick: 'off', antiunban: 'off', antibot: 'off',
            antiupdate: 'off', antitoken: 'off', antieveryone: 'off', antihere: 'off', antideco: 'off',
            blrank: 'off', punishment: 'derank', punishments: {}, thresholds: {
                antichannel: '3/10s', antirole: '3/10s', antiban: '3/10s', antikick: '3/10s',
                antiwebhook: '2/10s', antiunban: '5/10s', antibot: '1/10s', antiupdate: '3/10s',
                antitoken: '2/10s', antieveryone: '3/10s', antihere: '3/10s', antideco: '5/10s',
                massjoin: 10, massjoinWindow: 8000
            },
            whitelist: [], blrankList: []
        },
        antidown: {
            enabled: false,
            vanity: null,
            restore: true,
            punishment: 'ban'
        },
        automod: {
            enabled: false,
            antispam: { enabled: false, threshold: 5, duration: 5000, punishment: 'warn', ignoredChannels: [] },
            antiflood: { enabled: false, threshold: 4, duration: 10000, similarity: 0.85, punishment: 'warn', ignoredChannels: [] },
            antilink: { enabled: false, mode: 'all', whitelist: [], punishment: 'warn', ignoredChannels: [] },
            antiinvite: { enabled: false, whitelist: [], punishment: 'warn', ignoredChannels: [] },
            antighostping: { enabled: false, punishment: 'warn' },
            antimassmention: { enabled: false, threshold: 5, punishment: 'warn' },
            antieveryone: { enabled: false, punishment: 'warn' },
            antihere: { enabled: false, punishment: 'warn' },
            badwords: { enabled: false, words: [], punishment: 'warn' },
            selfieChannels: [], ignoredChannels: [], ignoredRoles: [],
            strikes: { warn: 3, timeout: 5, mute: 5, kick: 7, ban: 10 },
            timeoutDuration: 60 * 60 * 1000
        },
        tickets: {
            enabled: false, category: null, supportRole: [], logChannel: null,
            maxTickets: 1, transcripts: true,
            embed: { title: 'Support Tickets', description: 'Cliquez sur le bouton pour créer un ticket.', color: '#5865F2' }
        },
        tempvoc: { enabled: false, createChannel: null, category: null, defaultName: '{user}\'s Channel', defaultLimit: 0 },
        giveaway: { channel: null, winMessage: '🎉 Bravo {winners} ! Vous gagnez **{prize}**' },
        welcome: { enabled: false, channel: null, message: 'Bienvenue {user} sur {server}!', autorole: null, roles: [], dm: false, dmMessage: '' },
        boost: { enabled: false, channel: null, message: 'Merci {user} pour le boost!', role: null },
        statsChannels: null,
        owners: [],
        ownerRoles: [],
        modRoles: [],
        adminRoles: [],
        totalCommands: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && !(source[key] instanceof Date)) {
            if (!target[key] || typeof target[key] !== 'object') target[key] = {};
            deepMerge(target[key], source[key]);
        } else if (target[key] === undefined) {
            target[key] = source[key];
        }
    }
    return target;
}

function getParentByPath(obj, parts, createMissing = false) {
    let current = obj;
    for (let index = 0; index < parts.length - 1; index++) {
        const part = parts[index];
        const value = current[part];

        if (value === undefined || value === null) {
            if (!createMissing) return null;
            current[part] = {};
        } else if (typeof value !== 'object' || Array.isArray(value) || value instanceof Date) {
            if (!createMissing) return null;
            current[part] = {};
        }

        current = current[part];
    }
    return current;
}

function normalizeArrayUpdateValue(value) {
    if (value && typeof value === 'object' && Array.isArray(value.$each)) {
        return value.$each;
    }
    return [value];
}

function applyDotNotation(obj, update) {
    for (const [key, value] of Object.entries(update)) {
        const parts = key.split('.');
        const parent = getParentByPath(obj, parts, true);
        parent[parts[parts.length - 1]] = value;
    }
}

function applyArrayOperator(obj, update, operator) {
    for (const [key, value] of Object.entries(update)) {
        const parts = key.split('.');
        const shouldCreate = operator !== '$pull';
        const parent = getParentByPath(obj, parts, shouldCreate);
        if (!parent) continue;

        const field = parts[parts.length - 1];
        if (parent[field] === undefined && shouldCreate) {
            parent[field] = [];
        }
        if (!Array.isArray(parent[field])) continue;

        const values = normalizeArrayUpdateValue(value);
        if (operator === '$push') {
            parent[field].push(...values);
        } else if (operator === '$pull') {
            parent[field] = parent[field].filter(existing => !values.includes(existing));
        } else if (operator === '$addToSet') {
            for (const item of values) {
                if (!parent[field].includes(item)) parent[field].push(item);
            }
        }
    }
}

function applyOperators(obj, update) {
    if (update.$set) applyDotNotation(obj, update.$set);
    if (update.$push) applyArrayOperator(obj, update.$push, '$push');
    if (update.$pull) applyArrayOperator(obj, update.$pull, '$pull');
    if (update.$addToSet) applyArrayOperator(obj, update.$addToSet, '$addToSet');
    if (!update.$set && !update.$push && !update.$pull && !update.$addToSet) {
        applyDotNotation(obj, update);
    }
}

function attachSave(doc) {
    if (!doc) return null;
    if (!doc.save) {
        doc.save = async function () {
            this.updatedAt = new Date();
            store[this.guildId] = this;
            scheduleSave();
            return this;
        };
    }
    return doc;
}

function getValueByPath(obj, pathKey) {
    return pathKey.split('.').reduce((current, key) => current?.[key], obj);
}

function matchesQuery(guild, query) {
    return Object.entries(query).every(([key, expected]) => {
        const actual = getValueByPath(guild, key);

        if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
            if ('$in' in expected && Array.isArray(expected.$in)) {
                return expected.$in.includes(actual);
            }
            if ('$ne' in expected) {
                return actual !== expected.$ne;
            }
        }

        return actual === expected;
    });
}

const Guild = {
    findOne: async ({ guildId }) => {
        await ensureLoaded();
        const doc = store[guildId];
        return doc ? attachSave(doc) : null;
    },

    find: async (query = {}) => {
        await ensureLoaded();
        return Object.values(store).filter(g => matchesQuery(g, query)).map(attachSave);
    },

    create: async (data) => {
        await ensureLoaded();
        const doc = attachSave({ ...makeDefault(data.guildId), ...data });
        store[doc.guildId] = doc;
        scheduleSave();
        return doc;
    },

    updateOne: async ({ guildId }, update) => {
        await ensureLoaded();
        let doc = store[guildId];
        if (!doc) doc = makeDefault(guildId);
        applyOperators(doc, update);
        doc.updatedAt = new Date();
        store[guildId] = doc;
        scheduleSave();
        return { modifiedCount: 1 };
    },

    findOneAndDelete: async ({ guildId }) => {
        await ensureLoaded();
        const doc = store[guildId];
        delete store[guildId];
        scheduleSave();
        return doc;
    },

    deleteMany: async () => {
        await ensureLoaded();
        const count = Object.keys(store).length;
        store = {};
        scheduleSave();
        return { deletedCount: count };
    },

    getOrCreate: async (guildId) => {
        await ensureLoaded();
        if (!store[guildId]) {
            store[guildId] = makeDefault(guildId);
            normalizedGuilds.add(guildId);
            scheduleSave();
        } else if (!normalizedGuilds.has(guildId)) {
            // La migration vers les valeurs par défaut ne doit être faite
            // qu'une fois par processus, pas à chaque commande.
            store[guildId] = deepMerge(store[guildId], makeDefault(guildId));
            normalizedGuilds.add(guildId);
        }
        return attachSave(store[guildId]);
    },
};

module.exports = Guild;
