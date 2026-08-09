'use strict';
const Sanction = require('../../models/Sanction');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'warns',
    category: 'moderation',
    description: 'Voir les avertissements d\'un membre.',
    usage: '+warns [utilisateur]',
    permissions: ['KickMembers'],
    cooldown: 5,
    async run(client, message, args) {
        const member = args[0]
            ? await Helpers.resolveMember(message.guild, args[0]) || null
            : message.member;

        if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });

        const warns = (await Sanction.find({
            guildId: message.guild.id,
            userId: member.id,
            type: 'warn',
        })).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);

        if (!warns.length) {
            return message.channel.send({ embeds: [EmbedHelper.success(message.t('moderation.warn.no_warns'))] });
        }

        const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle(message.t('moderation.warn.list_title', { user: member.user.tag }))
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setDescription(warns.map((w) =>
                `**#${w.caseId}** — ${Helpers.discordTimestamp(w.createdAt, 'R')}\n> **Raison:** ${Helpers.truncate(w.reason, 100)}\n> **Modérateur:** <@${w.moderatorId}>`
            ).join('\n\n'))
            .setFooter({ text: `${warns.length} avertissement(s)` })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    },
};
