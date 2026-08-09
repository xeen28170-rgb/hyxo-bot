'use strict';

const Logger = require('../../utils/logger');
const ModerationService = require('../../services/moderationService');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const LogDispatcher = require('../../utils/logDispatcher');
const PermissionsHelper = require('../../utils/permissions');

module.exports = {
    name: 'ban',
    category: 'moderation',
    description: 'Bannir un utilisateur du serveur.',
    usage: '+ban <utilisateur> [durée] [raison]',
    permissions: ['BanMembers'],
    botPermissions: ['BanMembers'],
    cooldown: 5,
    async run(client, message, args) {
        try {
            if (!args[0]) return message.channel.send({ embeds: [EmbedHelper.error(`Usage : \`${module.exports.usage}\``)] });

            if (args[0].toLowerCase() === 'list') {
                return message.channel.send({ embeds: [EmbedHelper.error('Utilise `+banlist` pour afficher les bannissements actifs.')] });
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
                { color: EmbedHelper.Colors.ERROR }
            );
            embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
            embed.setFooter({ text: `Cas #${sanction.caseId}  ·  ID : ${user.id}` });

            await message.channel.send({ embeds: [embed] });
        } catch (err) {
            Logger.error('Erreur lors du bannissement:', err);
            message.channel.send({ embeds: [EmbedHelper.error(`Erreur lors du bannissement : ${err.message}`)] });
        }
    },
};
