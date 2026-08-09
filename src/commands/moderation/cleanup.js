'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'cleanup',
    category: 'moderation',
    description: 'Déconnecte tous les membres d\'un salon vocal.',
    usage: '+cleanup <salon>',
    permissions: ['MoveMembers'],
    botPermissions: ['MoveMembers'],
    async run(client, message, args) {
        const channel = Helpers.resolveChannel(message.guild, args[0]);
        if (!channel || channel.type !== 2)
            return message.channel.send({ embeds: [EmbedHelper.error('Salon vocal introuvable ou invalide.')] });

        const members = channel.members;
        if (!members.size)
            return message.channel.send({ embeds: [EmbedHelper.error('Le salon est déjà vide.')] });

        let count = 0;
        for (const member of members.values()) {
            await member.voice.disconnect().catch(() => {});
            count++;
        }

        message.channel.send({ embeds: [EmbedHelper.success(`**${count}** membre${count > 1 ? 's' : ''} déconnecté${count > 1 ? 's' : ''} du salon **${channel.name}**.`)] });
    },
};
