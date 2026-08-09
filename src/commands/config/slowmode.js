'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'slowmode',
    category: 'config',
    description: 'Change la durée du mode lent sur un salon (max 6h)',
    usage: '<durée> [salon]',
    permissions: ['ManageChannels'],
    async run(client, message, args) {
        const durationStr = args[0];
        if (!durationStr) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir une durée (ex: 5s, 10m).')] });

        const durationMs = Helpers.parseDuration(durationStr);
        if (durationMs === null) return message.channel.send({ embeds: [EmbedHelper.error('Durée invalide.')] });

        const seconds = Math.floor(durationMs / 1000);
        if (seconds > 21600) return message.channel.send({ embeds: [EmbedHelper.error('Le mode lent ne peut pas dépasser 6 heures.')] });

        const channel = Helpers.resolveChannel(message.guild, args[1]) || message.channel;
        await channel.setRateLimitPerUser(seconds);

        message.channel.send({ embeds: [EmbedHelper.success(`Le mode lent de **${channel.name}** a été fixé à **${durationStr}**.`)] });
    },
};
