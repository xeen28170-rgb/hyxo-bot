'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'privatevoice.json');

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = {};
let isLoaded = false;

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(FILE)) store = JSON.parse(await fs.readFile(FILE, 'utf8'));
    } catch { store = {}; }
    if (!store || typeof store !== 'object' || Array.isArray(store)) store = {};
    isLoaded = true;
}

let saveTimeout = null;
function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    ModelRegistry.register(FILE, () =>
        writeJsonSync(FILE, store)
    );
    saveTimeout = setTimeout(async () => {
        try {
            await writeJson(FILE, store);
            ModelRegistry.unregister(FILE);
        } catch (e) { console.error('[PrivateVoice] Save error:', e.message); }
    }, 500);
}

function matchesQuery(doc, query = {}) {
    const entries = Object.entries(query).filter(([, expected]) => expected !== undefined && expected !== null);
    if (!entries.length) return false;
    return entries.every(([key, expected]) => doc[key] === expected);
}

module.exports = {
    findOne: async (query) => {
        await ensureLoaded();
        return Object.values(store).find(pv => matchesQuery(pv, query)) || null;
    },

    find: async (query) => {
        await ensureLoaded();
        let results = Object.values(store);
        if (query?.guildId) results = results.filter(pv => pv.guildId === query.guildId);
        return results;
    },

    findManyByOwner: async ({ guildId, ownerId }) => {
        await ensureLoaded();
        return Object.values(store).filter(pv =>
            pv.guildId === guildId && pv.ownerId === ownerId
        );
    },

    create: async (data) => {
        await ensureLoaded();
        const doc = {
            _id: data.channelId,
            guildId: data.guildId,
            channelId: data.channelId,
            ownerId: data.ownerId,
            ownerTag: data.ownerTag || '',
            accessLevel: data.accessLevel || 'member',
            permitted: Array.isArray(data.permitted) ? data.permitted : [],
            overriddenIds: Array.isArray(data.overriddenIds) ? data.overriddenIds : [],
            createdAt: Date.now(),
        };
        store[data.channelId] = doc;
        scheduleSave();
        return doc;
    },

    updateOne: async (query, update) => {
        await ensureLoaded();
        const doc = Object.values(store).find(pv => matchesQuery(pv, query));
        if (!doc) return { modifiedCount: 0 };
        if (update.$addToSet) {
            for (const [key, values] of Object.entries(update.$addToSet)) {
                const list = Array.isArray(values) ? values : [values];
                if (!Array.isArray(doc[key])) doc[key] = [];
                for (const v of list) if (!doc[key].includes(v)) doc[key].push(v);
            }
        }
        if (update.$set) Object.assign(doc, update.$set);
        if (update.$pull) {
            for (const [key, values] of Object.entries(update.$pull)) {
                const list = Array.isArray(values) ? values : [values];
                if (Array.isArray(doc[key])) doc[key] = doc[key].filter(v => !list.includes(v));
            }
        }
        scheduleSave();
        return { modifiedCount: 1 };
    },

    deleteOne: async (query) => {
        await ensureLoaded();
        const doc = Object.values(store).find(pv => matchesQuery(pv, query));
        if (doc) {
            delete store[doc.channelId];
            scheduleSave();
        }
        return { deletedCount: doc ? 1 : 0 };
    },
};
