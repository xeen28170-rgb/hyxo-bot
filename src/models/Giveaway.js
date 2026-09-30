'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'giveaways.json');

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = {};
let _idCounter = 1;
let isLoaded = false;

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(FILE)) {
            store = JSON.parse(await fs.readFile(FILE, 'utf8'));
            for (const g of Object.values(store)) {
                if (g.endsAt) g.endsAt = new Date(g.endsAt);
                if (g.createdAt) g.createdAt = new Date(g.createdAt);
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
        } catch (e) { console.error('[Giveaway] Save error:', e.message); }
    }, 500);
}

module.exports = {
    find: async (query) => {
        await ensureLoaded();
        let results = Object.values(store);
        if (query?.guildId) results = results.filter(g => g.guildId === query.guildId);
        if (query?.ended !== undefined) results = results.filter(g => g.ended === query.ended);
        if (query?.endsAt?.$lte) results = results.filter(g => new Date(g.endsAt) <= query.endsAt.$lte);
        return results;
    },

    findOne: async (query) => {
        await ensureLoaded();
        return Object.values(store).find(g =>
            (query._id === undefined || g._id === query._id) &&
            (!query.guildId || g.guildId === query.guildId) &&
            (!query.messageId || g.messageId === query.messageId) &&
            (query.ended === undefined || g.ended === query.ended)
        ) || null;
    },

    create: async (data) => {
        await ensureLoaded();
        const id = _idCounter++;
        const doc = { ...data, _id: id, ended: false, active: true, participants: [], winnerIds: [], blacklist: [], createdAt: new Date() };
        store[id] = doc;
        scheduleSave();
        return doc;
    },

    updateOne: async (query, update) => {
        await ensureLoaded();
        const doc = Object.values(store).find(g =>
            Object.entries(query).every(([k, v]) => g[k] === v)
        );
        if (doc) {
            Object.assign(doc, update.$set || update);
            scheduleSave();
        }
        return { modifiedCount: doc ? 1 : 0 };
    },
};
