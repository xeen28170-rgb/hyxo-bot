'use strict';

const fs   = require('fs-extra');
const path = require('path');
const { writeJson } = require('./jsonStore');

const DATA_DIR = path.join(process.cwd(), 'data');

const WRITE_DEBOUNCE = 500;

const stores = {};

function filePath(name) {
    return path.join(DATA_DIR, `${name}.json`);
}

async function init() {
    await fs.ensureDir(DATA_DIR);
}

async function loadStore(name, type = 'map') {
    if (stores[name]) return stores[name].data;

    const fp = filePath(name);
    let raw = [];

    if (await fs.pathExists(fp)) {
        try {
            raw = await fs.readJson(fp);
        } catch {
            raw = [];
        }
    }

    let data;
    if (type === 'map') {
        data = new Map(Array.isArray(raw) ? raw : []);
    } else {
        data = Array.isArray(raw) ? raw : [];
    }

    stores[name] = { data, type, dirty: false, timer: null };
    return data;
}

function scheduleSave(name) {
    const s = stores[name];
    if (!s) return;
    s.dirty = true;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => flush(name), WRITE_DEBOUNCE);
}

async function flush(name) {
    const s = stores[name];
    if (!s || !s.dirty) return;
    s.dirty = false;
    s.timer = null;
    const serialized = s.type === 'map' ? [...s.data.entries()] : s.data;
    await writeJson(filePath(name), serialized, { spaces: 0 });
}

async function flushAll() {
    await Promise.all(Object.keys(stores).map(flush));
}

module.exports = {
    init,
    loadStore,
    scheduleSave,
    flushAll,
    flush,
};
