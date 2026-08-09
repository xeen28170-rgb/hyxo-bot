'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'clearlimit',
    aliases: ['clear limit'],
    category: 'moderation_config',
    description: 'Change le nombre maximum de messages pouvant être supprimés en une seule commande clear',
    usage: '<nombre>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const limit = parseInt(args[0], 10);
        if (isNaN(limit) || limit < 1 || limit > 1000)
            return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir un nombre valide entre 1 et 1000.')] });

        await Guild.updateOne({ guildId: message.guild.id }, { 'moderation.clearLimit': limit });
        client.cache.invalidateGuild(message.guild.id);
        message.channel.send({ embeds: [EmbedHelper.success(`La limite du clear a été fixée à **${limit}** messages.`)] });
    },
};
