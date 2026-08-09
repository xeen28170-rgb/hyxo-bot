'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'twitch_alerts.json');

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = {};
let isLoaded = false;

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(FILE)) {
            store = JSON.parse(await fs.readFile(FILE, 'utf8'));
            for (const [key, alert] of Object.entries(store)) {
                alert._id = alert._id || key;
                alert.isLive = alert.isLive || false;
                alert.lastLiveId = alert.lastLiveId || null;
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
        } catch (e) { console.error('[TwitchAlert] Save error:', e.message); }
    }, 500);
}

function matchesValue(actual, expected) {
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        if ('$in' in expected && Array.isArray(expected.$in)) return expected.$in.includes(actual);
        if ('$ne' in expected) return actual !== expected.$ne;
    }
    return expected === undefined || actual === expected;
}

function matchesQuery(doc, query = {}) {
    return Object.entries(query).every(([key, expected]) => matchesValue(doc[key], expected));
}

function applyUpdate(doc, update) {
    const payload = update.$set || Object.fromEntries(
        Object.entries(update).filter(([key]) => !key.startsWith('$'))
    );
    Object.assign(doc, payload);
}

module.exports = {
    find: async (query) => {
        await ensureLoaded();
        return Object.values(store).filter(alert => matchesQuery(alert, query));
    },

    findOne: async (query) => {
        await ensureLoaded();
        return Object.values(store).find(alert => matchesQuery(alert, query)) || null;
    },

    findOneAndUpdate: async ({ guildId, streamerName }, data) => {
        await ensureLoaded();
        const key = `${guildId}:${streamerName}`;
        const doc = store[key] || { _id: key, guildId, streamerName, isLive: false, lastLiveId: null };
        doc._id = doc._id || key;
        applyUpdate(doc, data);
        store[key] = doc;
        scheduleSave();
        return doc;
    },

    findOneAndDelete: async ({ guildId, streamerName }) => {
        await ensureLoaded();
        const key = `${guildId}:${streamerName}`;
        const doc = store[key];
        if (doc) {
            delete store[key];
            scheduleSave();
        }
        return doc || null;
    },

    updateOne: async (query, update) => {
        await ensureLoaded();
        for (const doc of Object.values(store)) {
            if (matchesQuery(doc, query)) {
                applyUpdate(doc, update);
                scheduleSave();
                return { modifiedCount: 1 };
            }
        }
        return { modifiedCount: 0 };
    },

    updateMany: async (query, update) => {
        await ensureLoaded();
        let modified = 0;
        for (const doc of Object.values(store)) {
            if (matchesQuery(doc, query)) {
                applyUpdate(doc, update);
                modified++;
            }
        }
        if (modified) scheduleSave();
        return { modifiedCount: modified };
    },
};
