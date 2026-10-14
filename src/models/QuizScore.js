'use strict';

// Points du quiz par membre et par serveur (classement +quizz top).

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ModelRegistry = require('../utils/modelRegistry');
const { writeJson, writeJsonSync } = require('../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'quiz_scores.json');

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
    ModelRegistry.register(FILE, () => writeJsonSync(FILE, store));
    saveTimeout = setTimeout(async () => {
        try {
            await writeJson(FILE, store);
            ModelRegistry.unregister(FILE);
        } catch (e) { console.error('[QuizScore] Save error:', e.message); }
    }, 500);
}

module.exports = {
    /** Ajoute un point et renvoie le nouveau total du membre. */
    addPoint: async (guildId, userId) => {
        await ensureLoaded();
        const key = `${guildId}:${userId}`;
        const doc = store[key] || { guildId, userId, points: 0 };
        doc.points++;
        doc.lastWinAt = Date.now();
        store[key] = doc;
        scheduleSave();
        return doc.points;
    },

    /** Classement du serveur, du meilleur au moins bon. */
    top: async (guildId, limit = 10) => {
        await ensureLoaded();
        return Object.values(store)
            .filter(doc => doc.guildId === guildId)
            .sort((a, b) => b.points - a.points || (a.lastWinAt || 0) - (b.lastWinAt || 0))
            .slice(0, limit);
    },

    rank: async (guildId, userId) => {
        await ensureLoaded();
        const list = Object.values(store).filter(doc => doc.guildId === guildId).sort((a, b) => b.points - a.points);
        const index = list.findIndex(doc => doc.userId === userId);
        return index === -1 ? null : { position: index + 1, points: list[index].points, total: list.length };
    },

    reset: async (guildId) => {
        await ensureLoaded();
        for (const key of Object.keys(store)) if (store[key].guildId === guildId) delete store[key];
        scheduleSave();
    },
};
