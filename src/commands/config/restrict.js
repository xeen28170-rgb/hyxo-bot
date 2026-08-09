'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'restrict',
    category: 'config',
    description: 'Rend un émoji accessible seulement aux personnes ayant le ou les rôles précisés',
    usage: '<émoji> <rôle>',
    permissions: ['ManageRoles'],
    async run(client, message, args) {
        const emojiArg = args[0];
        const role = Helpers.resolveRole(message.guild, args.slice(1).join(' '));

        if (!emojiArg) return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+restrict <émoji> <rôle>`')] });
        if (!role) return message.channel.send({ embeds: [EmbedHelper.error('Rôle introuvable.')] });

        const emojiId = emojiArg.match(/\d{15,}/)?.[0];
        const emoji = emojiId ? message.guild.emojis.cache.get(emojiId) : message.guild.emojis.cache.find(e => e.name === emojiArg);
        if (!emoji) return message.channel.send({ embeds: [EmbedHelper.error('Émoji introuvable sur ce serveur.')] });

        await emoji.edit({ roles: [...emoji.roles.cache.keys(), role.id] });
        message.channel.send({ embeds: [EmbedHelper.success(`L'émoji ${emoji} est maintenant restreint au rôle **${role.name}**.`)] });
    },
};
