'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Logger = require('../../utils/logger');

module.exports = {
    name: 'lang',
    category: 'owners',
    ownerOnly: true,
    description: 'Change la langue par défaut du bot',
    usage: '<getlang|fr|en>',
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'getlang') {
            return message.channel.send({ embeds: [EmbedHelper.info('🌐 Langue actuelle', `Langue par défaut: **${client.defaultLanguage}**\nFichiers disponibles: \`fr.json\`, \`en.json\``, { color: 0xFF0000 })] });
        }

        if (!sub || !['fr', 'en'].includes(sub)) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${this.usage}\``)] });
        }

        client.defaultLanguage = sub;
        Logger.info(`[LANG] Langue par défaut changée pour "${sub}" par ${message.author.tag}`);
        message.channel.send({ embeds: [EmbedHelper.success(`Langue par défaut du bot changée pour **${sub}**.`)] });
    },
};
