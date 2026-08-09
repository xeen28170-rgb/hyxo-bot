
'use strict';

const path = require('path');
const fs = require('fs-extra');
const Logger = require('../utils/logger');

class LanguageHandler {
    constructor(client) {
        this.client = client;
        this.languages = {};
        this.languagesPath = path.join(process.cwd(), 'src', 'languages');
    }

    async load() {
        this.languages = {};
        const files = (await fs.readdir(this.languagesPath)).filter(f => f.endsWith('.json'));

        for (const file of files) {
            const lang = file.replace('.json', '');
            try {
                const content = await fs.readJSON(path.join(this.languagesPath, file));
                this.languages[lang] = content;
                Logger.debug(`Langue chargée: ${lang}`);
            } catch (error) {
                Logger.error(`Erreur chargement langue ${file}:`, error);
            }
        }

        this.client.languages = this.languages;
        this.client.translate = this.translate.bind(this);

        Logger.success(`${Object.keys(this.languages).length} langue(s) chargée(s): ${Object.keys(this.languages).join(', ')}`);
    }

    /**
     * Traduire une clé
     * @param {string} lang - Code langue (fr, en)
     * @param {string} key - Clé de traduction (ex: "moderation.ban.success")
     * @param {Object} vars - Variables à remplacer
     */
    translate(lang, key, vars = {}) {
        const language = this.languages[lang] || this.languages['fr'];
        if (!language) return key;

        const keys = key.split('.');
        let value = language;

        for (const k of keys) {
            value = value?.[k];
            if (value === undefined) break;
        }

        if (value === undefined && lang !== 'fr') {
            return this.translate('fr', key, vars);
        }

        if (typeof value !== 'string') return key;

        return value.replace(/\{(\w+)\}/g, (match, varName) => {
            return vars[varName] !== undefined ? vars[varName] : match;
        });
    }
}

module.exports = LanguageHandler;
