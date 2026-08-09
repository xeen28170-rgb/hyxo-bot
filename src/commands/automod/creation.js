'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'creation',
    category: 'automod',
    description: 'Définit la limite d\'ancienneté du compte pour rejoindre',
    usage: 'limit <durée>',
    permissions: ['Administrator'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        const limit = args[1];

        if (sub === 'limit' && limit) {
            await Guild.updateOne({ guildId: message.guild.id }, { 'antiraid.creationLimit': limit });
            return message.channel.send({ embeds: [EmbedHelper.success(`Limite de création de compte réglée sur **${limit}**.`)] });
        }

        return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+creation limit <durée>` (ex: 2d, 1w)')] });
    },
};
