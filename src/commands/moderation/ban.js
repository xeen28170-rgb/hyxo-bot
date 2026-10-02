'use strict';

const Logger = require('../../utils/logger');
const ModerationService = require('../../services/moderationService');
const SanctionCard = require('../../services/sanctionCard');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const LogDispatcher = require('../../utils/logDispatcher');
const PermissionsHelper = require('../../utils/permissions');

module.exports = {
    name: 'ban',
    category: 'moderation',
    description: 'Bannir un utilisateur du serveur.',
    usage: '-ban <utilisateur> [durée] [raison]',
    permissions: ['BanMembers'],
    botPermissions: ['BanMembers'],
    cooldown: 5,
    async run(client, message, args) {
        try {
            if (!args[0]) {
                const prefix = message.guildSettings?.prefix || client.prefix;
                return message.channel.send({ embeds: [EmbedHelper.error(`Usage : \`${prefix}ban <utilisateur> [durée] [raison]\``)] });
            }

            if (args[0].toLowerCase() === 'list') {
                const prefix = message.guildSettings?.prefix || client.prefix;
                return message.channel.send({ embeds: [EmbedHelper.error(`Utilise \`${prefix}banlist\` pour afficher les bannissements actifs.`)] });
            }

            const member = await Helpers.resolveMember(message.guild, args[0]);
            const user = member?.user || await Helpers.resolveUser(client, args[0], message.guild);
            if (!user) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });

            const alreadyBanned = await message.guild.bans.fetch(user.id).then(() => true).catch(() => false);
            if (alreadyBanned) return message.channel.send({ embeds: [EmbedHelper.error(message.t('moderation.ban.already_banned'))] });

            if (member) {
                const check = await Helpers.checkTarget(message, member);
                if (!check.allowed) return message.channel.send({ embeds: [EmbedHelper.error(check.reason)] });
                if (!PermissionsHelper.botCanTarget(message.guild, member))
                    return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.bot_higher_role'))] });
            }

            let duration = null, reasonStart = 1;
            const possibleDuration = Helpers.parseDuration(args[1]);
            if (possibleDuration) { duration = possibleDuration; reasonStart = 2; }

            const reason = args.slice(reasonStart).join(' ') || message.t('general.no_reason');

            if (member) await ModerationService.sendDM(user, duration ? 'tempban' : 'ban', message.guild, reason, message.author, duration).catch(() => {});

            LogDispatcher.markModerationAction(message.guild.id, duration ? 'tempban' : 'ban', user.id);
            await message.guild.members.ban(user.id, { reason: `${message.author.tag} | ${reason}`, deleteMessageSeconds: 0 });

            const sanction = await ModerationService.createSanction({
                guildId: message.guild.id, userId: user.id,
                moderatorId: message.author.id, type: duration ? 'tempban' : 'ban',
                reason, duration,
            });

            await ModerationService.sendModLog(client, message.guild, sanction, user, message.author, message.guildSettings);

            const embed = EmbedHelper.info(
                duration ? 'Bannissement temporaire' : 'Bannissement',
                `**${user.username}** a été banni du serveur.${duration ? `\n**Durée** — ${Helpers.formatDuration(duration)}` : ''}\n**Raison** — ${reason}`,
                { color: EmbedHelper.Colors.ERROR, emoji: EmbedHelper.Emoji('BAN') }
            );
            embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
            embed.setFooter({ text: `Cas #${sanction.caseId}  ·  ID : ${user.id}` });

            await SanctionCard.send(message.channel, embed, {
                type: duration ? 'tempban' : 'ban', user, moderator: message.author, reason,
                duration: duration ? Helpers.formatDuration(duration) : null, caseId: sanction.caseId,
            });
        } catch (err) {
            Logger.error('Erreur lors du bannissement:', err);
            message.channel.send({ embeds: [EmbedHelper.error(`Erreur lors du bannissement : ${err.message}`)] });
        }
    },
};
