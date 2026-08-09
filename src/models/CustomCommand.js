'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'custom_commands.json');

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
        } catch (e) { console.error('[CustomCommand] Save error:', e.message); }
    }, 500);
}

module.exports = {
    find: async ({ guildId }) => {
        await ensureLoaded();
        return Object.values(store).filter(c => c.guildId === guildId);
    },

    findOne: async ({ guildId, name }) => {
        await ensureLoaded();
        return store[`${guildId}:${name}`] || null;
    },

    findOneAndUpdate: async ({ guildId, name }, data) => {
        await ensureLoaded();
        const key = `${guildId}:${name}`;
        const doc = store[key] || { guildId, name, uses: 0, createdAt: new Date() };
        Object.assign(doc, data);
        store[key] = doc;
        scheduleSave();
        return doc;
    },

    findOneAndDelete: async ({ guildId, name }) => {
        await ensureLoaded();
        const key = `${guildId}:${name}`;
        const doc = store[key];
        delete store[key];
        scheduleSave();
        return doc;
    },

    deleteMany: async ({ guildId } = {}) => {
        await ensureLoaded();
        const before = Object.keys(store).length;

        if (guildId) {
            for (const [key, command] of Object.entries(store)) {
                if (command.guildId === guildId) delete store[key];
            }
        } else {
            store = {};
        }

        const deletedCount = before - Object.keys(store).length;
        if (deletedCount > 0) scheduleSave();
        return { deletedCount };
    },
};
