'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'member',
    category: 'utility',
    description: 'Affiche les informations relatives à un membre sur le serveur',
    usage: '[membre]',
    async run(client, message, args) {
        const member = await Helpers.resolveMember(message.guild, args[0]) || message.member;

        const embed = EmbedHelper.info(`👤 Membre: ${member.user.tag}`, [
            `**ID:** \`${member.id}\``,
            `**Surnom:** ${member.nickname || 'Aucun'}`,
            `**Arrivée:** ${Helpers.discordTimestamp(member.joinedAt, 'f')}`,
            `**Rôle le plus haut:** ${member.roles.highest}`,
            `**Rôles:** ${member.roles.cache.size - 1}`,
        ].join('\n'), { color: 0xFF0000 });

        embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

        await message.channel.send({ embeds: [embed] });
    },
};
