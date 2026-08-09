'use strict';

const ModerationService = require('../../services/moderationService');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const LogDispatcher = require('../../utils/logDispatcher');
const PermissionsHelper = require('../../utils/permissions');

module.exports = {
    name: 'kick',
    category: 'moderation',
    description: 'Expulser un membre du serveur.',
    usage: '+kick <utilisateur> [raison]',
    permissions: ['KickMembers'],
    botPermissions: ['KickMembers'],
    cooldown: 5,
    async run(client, message, args) {
        try {
            if (!args[0]) return message.channel.send({ embeds: [EmbedHelper.error(`Usage : \`${module.exports.usage}\``)] });

            const member = await Helpers.resolveMember(message.guild, args[0]);
            if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });

            const check = await Helpers.checkTarget(message, member);
            if (!check.allowed) return message.channel.send({ embeds: [EmbedHelper.error(check.reason)] });
            if (!member.kickable) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.bot_higher_role'))] });
            if (!PermissionsHelper.canTarget(message.member, member)) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.higher_role'))] });
            if (member.id === message.guild.ownerId) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.cannot_target_owner'))] });

            const reason = args.slice(1).join(' ') || message.t('general.no_reason');

            await ModerationService.sendDM(member.user, 'kick', message.guild, reason, message.author, null).catch(() => {});
            LogDispatcher.markModerationAction(message.guild.id, 'kick', member.id);
            await member.kick(`${message.author.username} | ${reason}`);

            const sanction = await ModerationService.createSanction({
                guildId: message.guild.id, userId: member.id,
                moderatorId: message.author.id, type: 'kick', reason,
            });

            await ModerationService.sendModLog(client, message.guild, sanction, member.user, message.author, message.guildSettings);

            const embed = EmbedHelper.info(
                'Expulsion',
                `**${member.user.username}** a été expulsé du serveur.\n**Raison** — ${reason}`,
                { color: EmbedHelper.Colors.ERROR }
            );
            embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
            embed.setFooter({ text: `Cas #${sanction.caseId}  ·  ID : ${member.id}` });

            message.channel.send({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            message.channel.send({ embeds: [EmbedHelper.error(`Erreur lors de l'expulsion : ${err.message}`)] });
        }
    },
};
