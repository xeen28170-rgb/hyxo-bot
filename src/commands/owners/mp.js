'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'mp',
    category: 'owners',
    ownerOnly: true,
    description: 'Envoie un message privé à un membre via le bot',
    usage: '<membre> <message>',
    async run(client, message, args) {
        const target = await Helpers.resolveUser(client, args[0]);
        const text = args.slice(1).join(' ');

        if (!target || !text) return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+mp <membre> <message>`')] });

        try {
            await target.send(text);
            message.channel.send({ embeds: [EmbedHelper.success(`Message envoyé à **${target.tag}**.`)] });
        } catch {
            message.channel.send({ embeds: [EmbedHelper.error('Impossible d\'envoyer un message à cet utilisateur (DM fermés).')] });
        }
    },
};
