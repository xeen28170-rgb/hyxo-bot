'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'role',
    category: 'utility',
    description: 'Affiche les informations relatives à un rôle',
    usage: '<rôle>',
    async run(client, message, args) {
        const role = Helpers.resolveRole(message.guild, args.join(' '));
        if (!role) return message.channel.send({ embeds: [EmbedHelper.error('Rôle introuvable.')] });

        const embed = EmbedHelper.info(`🎭 Rôle: ${role.name}`, [
            `**ID:** \`${role.id}\``,
            `**Couleur:** ${role.hexColor}`,
            `**Position:** ${role.position}`,
            `**Mentionnable:** ${role.mentionable ? 'Oui' : 'Non'}`,
            `**Membres:** ${role.members.size}`,
            `**Création:** ${Helpers.discordTimestamp(role.createdAt, 'f')}`,
        ].join('\n'), { color: role.color || 0xFF0000 });

        message.channel.send({ embeds: [embed] });
    },
};
