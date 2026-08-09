'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'backups.json');

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = {};
let isLoaded = false;

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(FILE)) {
            store = JSON.parse(await fs.readFile(FILE, 'utf8'));
            for (const b of Object.values(store)) {
                if (b.createdAt) b.createdAt = new Date(b.createdAt);
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
        } catch (e) { console.error('[Backup] Save error:', e.message); }
    }, 500);
}

module.exports = {
    find: async (query) => {
        await ensureLoaded();
        let results = Object.values(store);
        if (query?.guildId) results = results.filter(b => b.guildId === query.guildId);
        return results;
    },

    findOne: async (query) => {
        await ensureLoaded();
        return Object.values(store).find(b =>
            (!query.guildId || b.guildId === query.guildId) &&
            (!query.backupId || b.backupId === query.backupId)
        ) || null;
    },

    create: async (data) => {
        await ensureLoaded();
        const doc = { ...data, createdAt: new Date() };
        store[doc.backupId] = doc;
        scheduleSave();
        return doc;
    },

    findOneAndDelete: async (query) => {
        await ensureLoaded();
        const doc = Object.values(store).find(b =>
            (!query.guildId || b.guildId === query.guildId) &&
            (!query.backupId || b.backupId === query.backupId)
        );
        if (doc) {
            delete store[doc.backupId];
            scheduleSave();
        }
        return doc || null;
    },

    deleteMany: async (query) => {
        await ensureLoaded();
        let count = 0;
        for (const key of Object.keys(store)) {
            const b = store[key];
            if (!query || !query.guildId || b.guildId === query.guildId) {
                delete store[key];
                count++;
            }
        }
        if (count > 0) scheduleSave();
        return { deletedCount: count };
    },
};
