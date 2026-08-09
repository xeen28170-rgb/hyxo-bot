'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'antiraid_logs.json');

const MAX_LOGS_PER_GUILD = 500;

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = [];
let isLoaded = false;

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(FILE)) {
            const raw = JSON.parse(await fs.readFile(FILE, 'utf8'));
            store = Array.isArray(raw) ? raw : [];
            for (const l of store) {
                if (l.createdAt) l.createdAt = new Date(l.createdAt);
            }
        }
    } catch { store = []; }
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
        } catch (e) { console.error('[AntiraidLog] Save error:', e.message); }
    }, 500);
}

module.exports = {
    find: async (query) => {
        await ensureLoaded();
        let results = [...store];
        if (query?.guildId) results = results.filter(l => l.guildId === query.guildId);
        return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    create: async (data) => {
        await ensureLoaded();
        const doc = { ...data, createdAt: new Date() };
        store.push(doc);

        if (data.guildId) {
            const guildLogs = store.filter(l => l.guildId === data.guildId);
            if (guildLogs.length > MAX_LOGS_PER_GUILD) {
                const toRemove = guildLogs.length - MAX_LOGS_PER_GUILD;
                let removed = 0;
                store = store.filter(l => {
                    if (l.guildId === data.guildId && removed < toRemove) {
                        removed++;
                        return false;
                    }
                    return true;
                });
            }
        }

        scheduleSave();
        return doc;
    },

    deleteMany: async (query) => {
        await ensureLoaded();
        const before = store.length;
        if (query?.guildId) {
            store = store.filter(l => l.guildId !== query.guildId);
        } else {
            store = [];
        }
        scheduleSave();
        return { deletedCount: before - store.length };
    },
};
