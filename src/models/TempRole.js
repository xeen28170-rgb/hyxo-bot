'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'temproles.json');

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = [];
let _id = 1;
let isLoaded = false;

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(FILE)) {
            store = JSON.parse(await fs.readFile(FILE, 'utf8'));
            for (const r of store) { if (r.expiresAt) r.expiresAt = new Date(r.expiresAt); }
            if (store.length) _id = Math.max(...store.map(r => r._id || 0)) + 1;
        }
    } catch (e) {
        console.error('[TempRole] Erreur chargement:', e.message);
        store = [];
    }
    isLoaded = true;
}

let saveTimeout = null;
function save() {
    if (saveTimeout) clearTimeout(saveTimeout);
    ModelRegistry.register(FILE, () =>
        writeJsonSync(FILE, store)
    );
    saveTimeout = setTimeout(async () => {
        try {
            await writeJson(FILE, store);
            ModelRegistry.unregister(FILE);
        }
        catch (e) { console.error('[TempRole] Erreur sauvegarde:', e.message); }
    }, 300);
}

module.exports = {
    create: async ({ guildId, userId, roleId, expiresAt }) => {
        await ensureLoaded();
        const doc = { _id: _id++, guildId, userId, roleId, expiresAt: new Date(expiresAt), createdAt: new Date() };
        store.push(doc);
        save();
        return doc;
    },

    remove: async ({ guildId, userId, roleId }) => {
        await ensureLoaded();
        const before = store.length;
        store = store.filter(r => !(r.guildId === guildId && r.userId === userId && r.roleId === roleId));
        if (store.length !== before) save();
        return { deletedCount: before - store.length };
    },

    getExpired: async () => {
        await ensureLoaded();
        const now = new Date();
        return store.filter(r => r.expiresAt && r.expiresAt <= now);
    },

    findAll: async () => {
        await ensureLoaded();
        return [...store];
    },

    findOne: async ({ guildId, userId, roleId }) => {
        await ensureLoaded();
        return store.find(r => r.guildId === guildId && r.userId === userId && r.roleId === roleId) || null;
    },
};
