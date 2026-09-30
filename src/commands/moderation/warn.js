'use strict';

const ModerationService = require('../../services/moderationService');
const Sanction = require('../../models/Sanction');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const Logger = require('../../utils/logger');

module.exports = {
    name: 'warn',
    category: 'moderation',
    description: 'Avertir un membre.',
    usage: '-warn <utilisateur> [raison]',
    permissions: ['KickMembers'],
    cooldown: 3,
    async run(client, message, args) {
        try {
            if (!args[0]) return message.channel.send({ embeds: [EmbedHelper.error(`Usage : \`${module.exports.usage}\``)] });

            const member = await Helpers.resolveMember(message.guild, args[0]);
            if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });

            const check = await Helpers.checkTarget(message, member);
            if (!check.allowed) return message.channel.send({ embeds: [EmbedHelper.error(check.reason)] });

            const reason = args.slice(1).join(' ') || message.t('general.no_reason');

            const sanction = await ModerationService.createSanction({
                guildId: message.guild.id,
                userId: member.id,
                moderatorId: message.author.id,
                type: 'warn',
                reason,
            });

            const warnCount = await Sanction.countDocuments({
                guildId: message.guild.id,
                userId: member.id,
                type: 'warn',
                active: true,
            });

            // MP en arrière-plan : la confirmation ne doit pas attendre la création du salon de MP.
            void ModerationService.sendDM(member.user, 'warn', message.guild, reason, message.author, null).catch(() => {});
            await ModerationService.sendModLog(client, message.guild, sanction, member.user, message.author, message.guildSettings);

            const embed = EmbedHelper.info(
                'Avertissement',
                `**${member.user.username}** a reçu un avertissement.\n\n**Raison** — ${reason}\n**Total avertissements** — ${warnCount}`,
                { color: EmbedHelper.Colors.WARNING, emoji: EmbedHelper.Emoji('WARN') }
            );
            embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
            embed.setFooter({ text: `Cas #${sanction.caseId}` });

            message.channel.send({ embeds: [embed] });
        } catch (err) {
            Logger.error('Erreur lors de l\'avertissement:', err);
            message.channel.send({ embeds: [EmbedHelper.error(`Une erreur est survenue : ${err.message}`)] });
        }
    },
};
