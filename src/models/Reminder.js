'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'reminders.json');

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = {};
let _idCounter = 1;
let isLoaded = false;

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(FILE)) {
            store = JSON.parse(await fs.readFile(FILE, 'utf8'));
            for (const r of Object.values(store)) {
                if (r.remindAt) r.remindAt = new Date(r.remindAt);
                if (r.createdAt) r.createdAt = new Date(r.createdAt);
            }
            const ids = Object.keys(store).map(Number).filter(n => !isNaN(n));
            if (ids.length) _idCounter = Math.max(...ids) + 1;
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
        } catch (e) { console.error('[Reminder] Save error:', e.message); }
    }, 500);
}

module.exports = {
    find: async (query) => {
        await ensureLoaded();
        let results = Object.values(store);
        if (query?.active !== undefined) results = results.filter(r => r.active === query.active);
        if (query?.remindAt?.$lte) results = results.filter(r => new Date(r.remindAt) <= query.remindAt.$lte);
        return results.slice(0, query?.limit || results.length);
    },

    create: async (data) => {
        await ensureLoaded();
        const id = _idCounter++;
        const doc = { ...data, _id: id, active: true, createdAt: new Date() };
        store[id] = doc;
        scheduleSave();
        return doc;
    },

    updateOne: async ({ _id: id }, update) => {
        await ensureLoaded();
        const doc = store[id];
        if (doc) {
            Object.assign(doc, update.$set || update);
            scheduleSave();
        }
        return { modifiedCount: doc ? 1 : 0 };
    },
};
