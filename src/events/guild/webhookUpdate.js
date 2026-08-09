'use strict';

const { AuditLogEvent } = require('discord.js');
const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'webhookUpdate',
    async run(client, channel) {
        if (!channel?.guild) return;
        for (const type of [AuditLogEvent.WebhookCreate, AuditLogEvent.WebhookUpdate, AuditLogEvent.WebhookDelete]) {
            if (await LogDispatcher.isSelfAuditAction(client, channel.guild, type)) return;
        }

        const embed = EmbedHelper.info('🔗 Webhooks modifiés', [
            `**Salon:** ${channel} (\`${channel.id}\`)`,
            'Un webhook a été créé, modifié ou supprimé.',
        ].join('\n'), { color: 0xFEE75C });
        await LogDispatcher.webhooks(channel.guild, embed);
    },
};
