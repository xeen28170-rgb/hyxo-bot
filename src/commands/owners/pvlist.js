'use strict';

const { EmbedBuilder } = require('discord.js');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');
const { LEVEL, getAccessLevel, PrivateVoice } = require('../../utils/privateVoice');

module.exports = {
    name: 'pvlist',
    category: 'owners',
    description: 'Affiche la liste des salons actuellement en PV.',
    usage: '=pvlist',
    cooldown: 2,
    async run(client, message) {
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const level = await getAccessLevel(client, message.member, settings);

        // Accès : seuls les Owner et le propriétaire du bot.
        if (level < LEVEL.OWNER) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Réservé aux Owner et au propriétaire du bot.')] });
        }

        const rooms = await PrivateVoice.find({ guildId: message.guild.id });

        if (!rooms.length) {
            return message.channel.send({ embeds: [EmbedHelper.info('🔒 Salons privés', 'Aucun salon en PV actuellement.')] });
        }

        const lines = rooms.map((pv, i) => {
            const channel = message.guild.channels.cache.get(pv.channelId);
            const name = channel ? `**${channel.name}** (<#${pv.channelId}>)` : `\`${pv.channelId}\` (supprimé)`;
            return [
                `\`${i + 1}.\` ${name}`,
                `> ID: \`${pv.channelId}\``,
                `> Activé par: <@${pv.ownerId}> (\`${pv.ownerId}\`)`,
                `> Niveau: **${pv.accessLevel}**`,
                `> Accès supplémentaires: ${(pv.permitted || []).length}`,
            ].join('\n');
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setColor(EmbedHelper.Colors.TEMPVOC || 0x9B59B6)
            .setTitle(`🔒 Salons en PV (${rooms.length})`)
            .setDescription(lines.slice(0, 4000))
            .setFooter({ text: `Demandé par ${message.author.tag}` })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    },
};
