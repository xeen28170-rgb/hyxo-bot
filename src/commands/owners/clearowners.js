'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Guild = require('../../models/Guild');

module.exports = {
    name: 'clearowners',
    category: 'owners',
    ownerOnly: false,
    description: 'Supprime tous les owners du bot',
    async run(client, message) {
        const PermissionsHelper = require('../../utils/permissions');
        if (!PermissionsHelper.isCreator(message.author.id) && !PermissionsHelper.isGuildOwner(message.member)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Seul le propriétaire du serveur peut effectuer cette action.')] });
        }

        await Guild.updateOne({ guildId: message.guild.id }, { $set: { owners: [] } });
        // Sans invalidation, le cache garde les anciens owners (et leurs droits) un moment.
        client.cache.invalidateGuild(message.guild.id);
        message.channel.send({ embeds: [EmbedHelper.success('Tous les owners ont été supprimés.')] });
    },
};
