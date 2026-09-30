'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'tempvoice.json');

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = {};
let isLoaded = false;

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(FILE)) {
            store = JSON.parse(await fs.readFile(FILE, 'utf8'));
            for (const voice of Object.values(store)) {
                voice._id = voice._id || voice.channelId;
                if (voice.createdAt) voice.createdAt = new Date(voice.createdAt);
            }
        }
    } catch { store = {}; }
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
        } catch (e) { console.error('[TempVoice] Save error:', e.message); }
    }, 500);
}

function matchesQuery(doc, query = {}) {
    const entries = Object.entries(query).filter(([, expected]) => expected !== undefined && expected !== null);
    if (!entries.length) return false;
    return entries.every(([key, expected]) => doc[key] === expected);
}

function applyArrayUpdate(doc, update, operator) {
    for (const [key, value] of Object.entries(update)) {
        if (doc[key] === undefined && operator !== '$pull') doc[key] = [];
        if (!Array.isArray(doc[key])) continue;

        const values = value && typeof value === 'object' && Array.isArray(value.$each) ? value.$each : [value];
        if (operator === '$addToSet') {
            for (const item of values) if (!doc[key].includes(item)) doc[key].push(item);
        } else if (operator === '$pull') {
            doc[key] = doc[key].filter(item => !values.includes(item));
        }
    }
}

function applyUpdate(doc, update) {
    if (update.$addToSet) applyArrayUpdate(doc, update.$addToSet, '$addToSet');
    if (update.$pull) applyArrayUpdate(doc, update.$pull, '$pull');

    // Champs simples mélangés aux opérateurs (ex: { ownerId, $pull }) : appliqués aussi.
    const plain = Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith('$')));
    Object.assign(doc, update.$set || {}, plain);
}

module.exports = {
    findOne: async (query) => {
        await ensureLoaded();
        return Object.values(store).find(voice => matchesQuery(voice, query)) || null;
    },

    find: async (query) => {
        await ensureLoaded();
        let results = Object.values(store);
        if (query?.guildId) results = results.filter(v => v.guildId === query.guildId);
        return results;
    },

    create: async (data) => {
        await ensureLoaded();
        const doc = {
            ...data,
            _id: data._id || data.channelId,
            locked: false,
            hidden: false,
            permitted: [],
            denied: [],
            createdAt: new Date(),
        };
        store[data.channelId] = doc;
        scheduleSave();
        return doc;
    },

    updateOne: async (query, update) => {
        await ensureLoaded();
        const doc = Object.values(store).find(voice => matchesQuery(voice, query));
        if (!doc) return { modifiedCount: 0 };
        applyUpdate(doc, update);
        scheduleSave();
        return { modifiedCount: 1 };
    },

    deleteOne: async (query) => {
        await ensureLoaded();
        const doc = Object.values(store).find(voice => matchesQuery(voice, query));
        if (doc) {
            delete store[doc.channelId];
            scheduleSave();
        }
        return { deletedCount: doc ? 1 : 0 };
    },
};
