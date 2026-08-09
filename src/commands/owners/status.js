'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'status',
    category: 'owners',
    ownerOnly: true,
    description: 'Change le statut du bot',
    usage: '<online|idle|dnd|invisible>',
    async run(client, message, args) {
        const valid = ['online', 'idle', 'dnd', 'invisible'];
        const status = args[0]?.toLowerCase();
        if (!valid.includes(status)) return message.channel.send({ embeds: [EmbedHelper.error('Statut invalide (online, idle, dnd, invisible).')] });

        client.user.setStatus(status);
        message.channel.send({ embeds: [EmbedHelper.success(`Statut changé en : **${status}**`)] });
    },
};
