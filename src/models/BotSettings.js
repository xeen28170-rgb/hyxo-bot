'use strict';

const fs = require('fs/promises');
const path = require('path');
const { writeJson } = require('../utils/jsonStore');
const { withKey } = require('../utils/keyedQueue');
const file = path.join(__dirname, '../../data/bot-settings.json');

module.exports = {
    async get() {
        try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) {
            if (error.code === 'ENOENT') return {};
            throw error;
        }
    },
    async set(values) {
        return withKey('bot-settings', async () => {
            const settings = { ...await this.get(), ...values };
            await fs.mkdir(path.dirname(file), { recursive: true });
            await writeJson(file, settings);
            return settings;
        });
    },
};
