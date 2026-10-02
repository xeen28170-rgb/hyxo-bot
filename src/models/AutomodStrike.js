'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'automod_strikes.json');
const STRIKE_TTL = 24 * 60 * 60 * 1000; // 24h

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = {};
let isLoaded = false;

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(FILE)) store = JSON.parse(await fs.readFile(FILE, 'utf8'));
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
        } catch (e) { console.error('[AutomodStrike] Save error:', e.message); }
    }, 500);
}

module.exports = {
    findOne: async ({ userId, guildId }) => {
        await ensureLoaded();
        const key = `${guildId}:${userId}`;
        const doc = store[key];
        if (!doc) return null;
        if (Date.now() - doc.lastStrikeAt > STRIKE_TTL) {
            delete store[key];
            scheduleSave();
            return null;
        }
        return doc;
    },

    findOneAndUpdate: async ({ userId, guildId }, data) => {
        await ensureLoaded();
        const key = `${guildId}:${userId}`;
        if (store[key] && Date.now() - store[key].lastStrikeAt > STRIKE_TTL) delete store[key];
        const doc = store[key] || { userId, guildId, count: 0, lastStrikeAt: Date.now() };
        Object.assign(doc, data);
        store[key] = doc;
        scheduleSave();
        return doc;
    },

    reset: async ({ userId, guildId }) => {
        await ensureLoaded();
        delete store[`${guildId}:${userId}`];
        scheduleSave();
    },

    cleanup: async () => {
        await ensureLoaded();
        const now = Date.now();
        for (const key of Object.keys(store)) {
            if (now - store[key].lastStrikeAt > STRIKE_TTL) delete store[key];
        }
        scheduleSave();
    },
};

// Purge horaire des strikes expirés (une seule minuterie par processus :
// un hot-reload du module ne doit pas empiler). `unref()` laisse le process
// se terminer normalement, y compris sous `node --test`.
if (!globalThis.__hyxoAutomodStrikeCleanupStarted) {
    globalThis.__hyxoAutomodStrikeCleanupStarted = true;
    const timer = setInterval(() => module.exports.cleanup(), 60 * 60 * 1000);
    if (timer.unref) timer.unref();
}
