'use strict';

const ModerationService = require('../../services/moderationService');
const SanctionCard = require('../../services/sanctionCard');
const EmbedHelper = require('../../utils/embedBuilder');
const LogDispatcher = require('../../utils/logDispatcher');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'unban',
    category: 'moderation',
    description: 'Débannir un utilisateur.',
    usage: '-unban <ID|@mention>',
    permissions: ['BanMembers'],
    botPermissions: ['BanMembers'],
    cooldown: 5,
    async run(client, message, args) {
        const userId = Helpers.resolveUserId(args[0]);
        if (!userId) {
            return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${module.exports.usage}\`\nFournissez un ID Discord valide.`)] });
        }


        const banEntry = await message.guild.bans.fetch(userId).catch(() => null);
        if (!banEntry) {
            return message.channel.send({ embeds: [EmbedHelper.error(message.t('moderation.ban.not_banned'))] });
        }

        LogDispatcher.markModerationAction(message.guild.id, 'unban', userId);
        await message.guild.members.unban(userId, message.author.tag);

        const sanction = await ModerationService.createSanction({
            guildId: message.guild.id,
            userId,
            moderatorId: message.author.id,
            type: 'unban',
            reason: 'Aucune raison fournie',
        });

        await ModerationService.sendModLog(client, message.guild, sanction, banEntry.user, message.author, message.guildSettings);

        await SanctionCard.send(message.channel, EmbedHelper.success(message.t('moderation.ban.unban_success', { user: banEntry.user.tag })), {
            type: 'unban', user: banEntry.user, moderator: message.author, reason: 'Deuxième chance', caseId: sanction.caseId,
        });
    },
};
