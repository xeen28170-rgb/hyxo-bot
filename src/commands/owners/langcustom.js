'use strict';

const fs = require('fs-extra');
const path = require('path');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'langcustom',
    category: 'owners',
    ownerOnly: true,
    description: 'Permet de modifier une clé de traduction dans le fichier de langue',
    usage: '<fr|en> <clé> <valeur>',
    async run(client, message, args) {
        const lang = args[0]?.toLowerCase();
        const key = args[1];
        const value = args.slice(2).join(' ');

        if (!lang || !key || !value) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${this.usage}\``)] });
        }

        if (!['fr', 'en'].includes(lang)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Langue invalide. Utilisez `fr` ou `en`.')] });
        }

        const filePath = path.join(process.cwd(), 'src', 'languages', `${lang}.json`);

        if (!await fs.pathExists(filePath)) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Fichier \`${lang}.json\` introuvable.`)] });
        }

        const translations = await fs.readJson(filePath);

        const keys = key.split('.');
        for (const k of keys) {
            if (!k) return message.channel.send({ embeds: [EmbedHelper.error('Clé invalide (segment vide).')] });
            if (['__proto__', 'constructor', 'prototype'].includes(k)) {
                return message.channel.send({ embeds: [EmbedHelper.error('Clé invalide (segment réservé).')] });
            }
        }

        let current = translations;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;

        await fs.writeJson(filePath, translations, { spaces: 2 });
        message.channel.send({ embeds: [EmbedHelper.success(`Traduction \`${key}\` mise à jour en **${lang}**.`)] });
    },
};
