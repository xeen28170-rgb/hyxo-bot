'use strict';

const ModerationService = require('../../services/moderationService');
const EmbedHelper = require('../../utils/embedBuilder');
const LogDispatcher = require('../../utils/logDispatcher');

module.exports = {
    name: 'unban',
    category: 'moderation',
    description: 'Débannir un utilisateur.',
    usage: '-unban <ID>',
    permissions: ['BanMembers'],
    botPermissions: ['BanMembers'],
    cooldown: 5,
    async run(client, message, args) {
        if (!args[0] || !/^\d{17,20}$/.test(args[0])) {
            return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${module.exports.usage}\`\nFournissez un ID Discord valide.`)] });
        }

        const userId = args[0];

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

        message.channel.send({
            embeds: [EmbedHelper.success(message.t('moderation.ban.unban_success', { user: banEntry.user.tag }))],
        });
    },
};
