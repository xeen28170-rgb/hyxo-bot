'use strict';

const ModerationService = require('../../services/moderationService');
const SanctionCard = require('../../services/sanctionCard');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const PermissionsHelper = require('../../utils/permissions');

const baseMute = {
    permissions: ['ManageRoles'],
    botPermissions: ['ManageRoles'],
    cooldown: 5,
};

module.exports = {
    name: 'mute',
    category: 'moderation',
    description: 'Mettre un membre en sourdine.',
    usage: '-mute <utilisateur> [durée] [raison]',
    ...baseMute,
    async run(client, message, args) {
        if (!args[0]) return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${module.exports.usage}\``)] });

        const member = await Helpers.resolveMember(message.guild, args[0]);
        if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });
        if (!PermissionsHelper.canTarget(message.member, member)) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.higher_role'))] });

        const settings = message.guildSettings;
        const useTimeout = settings?.moderation?.useTimeout;

        let duration = null;
        let reasonStart = 1;
        const possibleDuration = Helpers.parseDuration(args[1]);
        if (possibleDuration) { duration = possibleDuration; reasonStart = 2; }

        const reason = args.slice(reasonStart).join(' ') || message.t('general.no_reason');

        if (useTimeout) {
            if (!duration) {
                const prefix = message.guildSettings?.prefix || client.prefix;
                return message.channel.send({ embeds: [EmbedHelper.error(`❌ Le mode Timeout Discord nécessite une durée. Ex: \`${prefix}mute @user 1h raison\``)] });
            }
            if (duration > 28 * 24 * 60 * 60 * 1000) {
                return message.channel.send({ embeds: [EmbedHelper.error('❌ La durée maximale pour un Timeout Discord est de **28 jours**.')] });
            }
            await member.timeout(duration, `${message.author.tag} | ${reason}`);
        } else {
            const muteRoleId = settings?.moderation?.muteRole;
            if (!muteRoleId) return message.channel.send({ embeds: [EmbedHelper.error(message.t('moderation.mute.no_mute_role'))] });

            const muteRole = message.guild.roles.cache.get(muteRoleId);
            if (!muteRole) return message.channel.send({ embeds: [EmbedHelper.error('❌ Le rôle de mute configuré est introuvable.')] });

            if (member.roles.cache.has(muteRoleId)) {
                return message.channel.send({ embeds: [EmbedHelper.error(message.t('moderation.mute.already_muted'))] });
            }

            await member.roles.add(muteRole, `${message.author.tag} | ${reason}`);
        }

        const sanction = await ModerationService.createSanction({
            guildId: message.guild.id, userId: member.id,
            moderatorId: message.author.id, type: duration ? 'tempmute' : 'mute',
            reason, duration,
            metadata: { useTimeout: Boolean(useTimeout), muteRoleId: settings?.moderation?.muteRole },
        });

        // DM + log en arrière-plan : la confirmation ne doit pas attendre deux appels Discord de plus.
        void Promise.all([
            ModerationService.sendDM(member.user, duration ? 'tempmute' : 'mute', message.guild, reason, message.author, duration),
            ModerationService.sendModLog(client, message.guild, sanction, member.user, message.author, settings),
        ]).catch(() => {});

        // Même présentation que le ban : titre, photo, durée, raison et numéro de cas.
        const embed = EmbedHelper.info(
            duration ? 'Exclusion temporaire' : 'Mute',
            `**${member.user.username}** a été ${duration ? 'exclu temporairement' : 'rendu muet'}.${duration ? `\n**Durée** — ${Helpers.formatDuration(duration)}` : ''}\n**Raison** — ${reason}`,
            { color: EmbedHelper.Colors.WARNING },
        );
        embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
        embed.setFooter({ text: `Cas #${sanction.caseId}  ·  ID : ${member.id}` });

        await SanctionCard.send(message.channel, embed, {
            type: duration ? 'tempmute' : 'mute', user: member.user, moderator: message.author, reason,
            duration: duration ? Helpers.formatDuration(duration) : null, caseId: sanction.caseId,
        });
    },
};
