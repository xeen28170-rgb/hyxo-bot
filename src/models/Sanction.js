'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const SANCTIONS_FILE = path.join(DATA_DIR, 'sanctions.json');

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = [];
let _idCounter = 1;
let isLoaded = false;

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(SANCTIONS_FILE)) {
            const raw = await fs.readFile(SANCTIONS_FILE, 'utf8');
            store = JSON.parse(raw);
            for (const s of store) {
                if (s.createdAt) s.createdAt = new Date(s.createdAt);
                if (s.expiresAt) s.expiresAt = new Date(s.expiresAt);
            }
            if (store.length > 0) {
                _idCounter = Math.max(...store.map(s => s._id || 0)) + 1;
            }
        }
    } catch (e) {
        const Logger = require('../utils/logger');
        Logger.error('[Sanction] Erreur chargement sanctions.json:', e.message);
        store = [];
    }
    isLoaded = true;
}

let saveTimeout = null;
function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    ModelRegistry.register(SANCTIONS_FILE, () =>
        writeJsonSync(SANCTIONS_FILE, store)
    );
    saveTimeout = setTimeout(async () => {
        try {
            await writeJson(SANCTIONS_FILE, store);
            ModelRegistry.unregister(SANCTIONS_FILE);
        } catch (e) {
            const Logger = require('../utils/logger');
            Logger.error('[Sanction] Erreur sauvegarde sanctions.json:', e.message);
        }
    }, 500);
}

module.exports = {
    find: async (query = {}) => {
        await ensureLoaded();
        let results = [...store];
        if (query.guildId) results = results.filter(s => s.guildId === query.guildId);
        if (query.userId) results = results.filter(s => s.userId === query.userId);
        if (query.active !== undefined) results = results.filter(s => s.active === query.active);
        if (query.type) results = results.filter(s => s.type === query.type);
        return results;
    },

    findOne: async (query) => {
        await ensureLoaded();
        return store.find(s => {
            if (query._id !== undefined && s._id !== query._id) return false;
            if (query.type !== undefined && s.type !== query.type) return false;
            if (query.guildId !== undefined && s.guildId !== query.guildId) return false;
            if (query.userId !== undefined && s.userId !== query.userId) return false;
            if (query.active !== undefined && s.active !== query.active) return false;
            if (query.expiresAt !== undefined) {
                // Support du style Mongo { expiresAt: { $lte: date } } utilisé par les
                // recherches de sanctions expirées — comparait auparavant toujours
                // à la date actuelle sans jamais lire la valeur passée en paramètre.
                const expected = query.expiresAt;
                if (!s.expiresAt) return false;
                const expiresAt = new Date(s.expiresAt);
                if (expected && typeof expected === 'object' && '$lte' in expected) {
                    if (!(expiresAt <= new Date(expected.$lte))) return false;
                } else if (!(expiresAt <= new Date(expected))) {
                    return false;
                }
            }
            return true;
        }) || null;
    },

    create: async (data) => {
        await ensureLoaded();
        const doc = {
            ...data,
            _id: _idCounter++,
            createdAt: new Date(),
            active: true,
        };
        store.push(doc);
        scheduleSave();
        return doc;
    },

    updateOne: async (query, update) => {
        await ensureLoaded();
        const doc = store.find(s => Object.entries(query).every(([key, value]) => s[key] === value));
        if (doc) {
            Object.assign(doc, update.$set || update);
            scheduleSave();
        }
        return { modifiedCount: doc ? 1 : 0 };
    },

    countDocuments: async (query) => {
        await ensureLoaded();
        return store.filter(s =>
            (!query.guildId || s.guildId === query.guildId) &&
            (!query.userId || s.userId === query.userId) &&
            (!query.type || s.type === query.type) &&
            (query.active === undefined || s.active === query.active)
        ).length;
    },

    getNextCaseId: async (guildId) => {
        await ensureLoaded();
        const sanctions = store.filter(s => s.guildId === guildId);
        return sanctions.length ? Math.max(...sanctions.map(s => s.caseId || 0)) + 1 : 1;
    },

    getExpired: async () => {
        await ensureLoaded();
        const now = new Date();
        return store.filter(s => s.active && s.expiresAt && new Date(s.expiresAt) <= now);
    },
};
