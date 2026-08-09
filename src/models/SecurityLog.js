'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'security_logs.json');
const MAX_LOGS_PER_GUILD = 700;

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR, { recursive: true });

let store = [];
let isLoaded = false;
let saveTimeout = null;

async function ensureLoaded() {
    if (isLoaded) return;
    try {
        if (fsSync.existsSync(FILE)) {
            const raw = JSON.parse(await fs.readFile(FILE, 'utf8'));
            store = Array.isArray(raw) ? raw : [];
            for (const log of store) {
                if (log.createdAt) log.createdAt = new Date(log.createdAt);
            }
        }
    } catch {
        store = [];
    }
    isLoaded = true;
}

function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    ModelRegistry.register(FILE, () =>
        writeJsonSync(FILE, store)
    );
    saveTimeout = setTimeout(async () => {
        try {
            await writeJson(FILE, store);
            ModelRegistry.unregister(FILE);
        } catch (error) {
            console.error('[SecurityLog] Save error:', error.message);
        }
    }, 500);
}

function trimGuildLogs(guildId) {
    const guildLogs = store.filter(log => log.guildId === guildId);
    if (guildLogs.length <= MAX_LOGS_PER_GUILD) return;

    const removeCount = guildLogs.length - MAX_LOGS_PER_GUILD;
    let removed = 0;
    store = store.filter(log => {
        if (log.guildId === guildId && removed < removeCount) {
            removed++;
            return false;
        }
        return true;
    });
}

module.exports = {
    create: async (data) => {
        await ensureLoaded();
        const doc = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: data.type || 'security',
            module: data.module || null,
            action: data.action || null,
            guildId: data.guildId,
            userId: data.userId || null,
            userTag: data.userTag || null,
            reason: data.reason || null,
            punishment: data.punishment || null,
            count: data.count || 1,
            details: data.details || {},
            createdAt: new Date(),
        };
        store.push(doc);
        if (doc.guildId) trimGuildLogs(doc.guildId);
        scheduleSave();
        return doc;
    },

    find: async (query = {}) => {
        await ensureLoaded();
        let results = [...store];
        if (query.guildId) results = results.filter(log => log.guildId === query.guildId);
        if (query.type) results = results.filter(log => log.type === query.type);
        if (query.module) results = results.filter(log => log.module === query.module);
        return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    deleteMany: async (query = {}) => {
        await ensureLoaded();
        const before = store.length;
        if (query.guildId) {
            store = store.filter(log => log.guildId !== query.guildId);
        } else {
            store = [];
        }
        scheduleSave();
        return { deletedCount: before - store.length };
    },
};
