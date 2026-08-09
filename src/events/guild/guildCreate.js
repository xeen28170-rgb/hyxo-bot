'use strict';

const Logger = require('../../utils/logger');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'guildCreate',
    once: false,
    async run(client, guild) {
        await getGuildSettings(client, guild.id);
        Logger.info(`Le bot a rejoint un nouveau serveur : ${guild.name} (ID: ${guild.id})`);
    },
};
