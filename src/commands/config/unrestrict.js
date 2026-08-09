'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'unrestrict',
    category: 'config',
    description: 'Rend un émoji de nouveau accessible à tout le monde',
    usage: '<émoji>',
    permissions: ['ManageRoles'],
    async run(client, message, args) {
        const emojiArg = args[0];
        if (!emojiArg) return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+unrestrict <émoji>`')] });

        const emojiId = emojiArg.match(/\d{15,}/)?.[0];
        const emoji = emojiId ? message.guild.emojis.cache.get(emojiId) : message.guild.emojis.cache.find(e => e.name === emojiArg);
        if (!emoji) return message.channel.send({ embeds: [EmbedHelper.error('Émoji introuvable sur ce serveur.')] });

        await emoji.edit({ roles: [] });
        message.channel.send({ embeds: [EmbedHelper.success(`L'émoji ${emoji} est de nouveau accessible à tout le monde.`)] });
    },
};
