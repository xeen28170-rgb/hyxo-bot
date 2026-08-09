'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'blacklist.json');

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
        } catch (e) { console.error('[Blacklist] Save error:', e.message); }
    }, 500);
}

module.exports = {
    find: async () => {
        await ensureLoaded();
        return Object.values(store);
    },

    findOne: async ({ userId }) => {
        await ensureLoaded();
        return store[userId] || null;
    },

    findOneAndUpdate: async ({ userId }, data) => {
        await ensureLoaded();
        const doc = store[userId] || { userId, createdAt: new Date() };
        Object.assign(doc, data);
        store[userId] = doc;
        scheduleSave();
        return doc;
    },

    findOneAndDelete: async ({ userId }) => {
        await ensureLoaded();
        const doc = store[userId];
        delete store[userId];
        scheduleSave();
        return doc;
    },

    deleteMany: async () => {
        await ensureLoaded();
        store = {};
        scheduleSave();
    },
};
