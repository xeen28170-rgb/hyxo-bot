'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'tickets.json');

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = {};
let _idCounter = 1;
let isLoaded = false;

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(FILE)) {
            store = JSON.parse(await fs.readFile(FILE, 'utf8'));
            for (const t of Object.values(store)) {
                if (t.createdAt) t.createdAt = new Date(t.createdAt);
                if (t.closedAt) t.closedAt = new Date(t.closedAt);
            }
            const ids = Object.values(store).map(t => t._id || 0);
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
        } catch (e) { console.error('[Ticket] Save error:', e.message); }
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

function hasEffectiveQuery(query = {}) {
    return Object.values(query).some(value => value !== undefined && value !== null);
}

function applyArrayUpdate(doc, update, operator) {
    for (const [key, value] of Object.entries(update)) {
        if (doc[key] === undefined && operator !== '$pull') doc[key] = [];
        if (!Array.isArray(doc[key])) continue;

        if (operator === '$addToSet') {
            if (!doc[key].includes(value)) doc[key].push(value);
        } else if (operator === '$pull') {
            doc[key] = doc[key].filter(item => item !== value);
        }
    }
}

function applyUpdate(doc, update) {
    if (update.$addToSet) applyArrayUpdate(doc, update.$addToSet, '$addToSet');
    if (update.$pull) applyArrayUpdate(doc, update.$pull, '$pull');

    const payload = update.$set || (!update.$addToSet && !update.$pull ? update : null);
    if (payload) Object.assign(doc, payload);
}

module.exports = {
    findOne: async (query) => {
        await ensureLoaded();
        return Object.values(store).find(ticket => matchesQuery(ticket, query)) || null;
    },

    find: async (query) => {
        await ensureLoaded();
        return Object.values(store).filter(ticket => matchesQuery(ticket, query));
    },

    create: async (data) => {
        await ensureLoaded();
        const id = _idCounter++;
        const doc = { ...data, _id: id, status: data.status || 'open', createdAt: new Date() };
        store[doc.channelId] = doc;
        scheduleSave();
        return doc;
    },

    updateOne: async (query, update) => {
        await ensureLoaded();
        if (!hasEffectiveQuery(query)) return { modifiedCount: 0 };
        const doc = Object.values(store).find(ticket => matchesQuery(ticket, query));
        if (!doc) return { modifiedCount: 0 };
        applyUpdate(doc, update);
        scheduleSave();
        return { modifiedCount: 1 };
    },

    countDocuments: async (query) => {
        await ensureLoaded();
        return Object.values(store).filter(ticket => matchesQuery(ticket, query)).length;
    },

    getNextId: async (guildId) => {
        await ensureLoaded();
        const tickets = Object.values(store).filter(t => t.guildId === guildId);
        return tickets.length ? Math.max(...tickets.map(t => t.ticketId || 0)) + 1 : 1;
    },

    deleteOne: async (query) => {
        await ensureLoaded();
        const doc = Object.values(store).find(ticket => matchesQuery(ticket, query));
        if (doc) {
            delete store[doc.channelId];
            scheduleSave();
        }
        return { deletedCount: doc ? 1 : 0 };
    },
};
