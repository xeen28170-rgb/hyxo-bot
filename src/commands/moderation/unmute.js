'use strict';

const ModerationService = require('../../services/moderationService');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'unmute',
    category: 'moderation',
    description: 'Retirer la sourdine d\'un membre.',
    usage: '-unmute <utilisateur>',
    permissions: ['ManageRoles'],
    botPermissions: ['ManageRoles'],
    cooldown: 5,
    async run(client, message, args) {
        if (!args[0]) return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${module.exports.usage}\``)] });

        const member = await Helpers.resolveMember(message.guild, args[0]);
        if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });

        const muteRoleId = message.guildSettings?.moderation?.muteRole;
        if (!muteRoleId) return message.channel.send({ embeds: [EmbedHelper.error(message.t('moderation.mute.no_mute_role'))] });

        if (!member.roles.cache.has(muteRoleId)) {
            return message.channel.send({ embeds: [EmbedHelper.error(message.t('moderation.mute.not_muted'))] });
        }

        const reason = 'Aucune raison fournie';

        await member.roles.remove(muteRoleId, `${message.author.tag} | ${reason}`);

        const sanction = await ModerationService.createSanction({
            guildId: message.guild.id, userId: member.id,
            moderatorId: message.author.id, type: 'unmute', reason,
        });

        await ModerationService.sendModLog(client, message.guild, sanction, member.user, message.author, message.guildSettings);
        message.channel.send({ embeds: [EmbedHelper.success(message.t('moderation.mute.unmute_success', { user: member.user.tag, reason }))] });
    },
};
