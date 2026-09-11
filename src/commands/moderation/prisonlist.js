'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'prisonlist',
    category: 'moderation',
    description: 'Affiche la liste des membres actuellement en prison sur le serveur.',
    usage: '-prisonlist',
    botPermissions: ['ManageRoles'],
    async run(client, message) {
        const settings = await getGuildSettings(client, message.guild.id, { create: false });
        const prisoners = Array.isArray(settings?.prison?.prisoners) ? settings.prison.prisoners : [];

        if (!prisoners.length) {
            return message.channel.send({ embeds: [EmbedHelper.info('⛓️ Prison — Liste', 'Aucun prisonnier actuellement.')] });
        }

        const lines = [];
        for (const userId of prisoners) {
            let member = message.guild.members.cache.get(userId);
            if (!member) {
                try { member = await message.guild.members.fetch(userId); } catch { member = null; }
            }
            if (!member) {
                lines.push(`<@${userId}> (\`${userId}\`) — *membre absent du serveur*`);
                continue;
            }
            lines.push(`${member.user.username} — <@${userId}> (\`${userId}\`)`);
        }

        const embed = EmbedHelper.info(`⛓️ Prisonniers (${prisoners.length})`, lines.join('\n'));
        message.channel.send({ embeds: [embed] });
    },
};