'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'secur-invite',
    category: 'owners',
    ownerOnly: true,
    description: 'Le bot quitte automatiquement les serveurs où le propriétaire n\'est pas dans la whitelist',
    usage: '<on/off> [owner_id]',
    async run(client, message, args) {
        const status = args[0]?.toLowerCase();

        if (!status || !['on', 'off'].includes(status)) {
            const current = client.securInvite || { enabled: false };
            const prefix = message.guildSettings?.prefix || client.prefix;
            return message.channel.send({ embeds: [EmbedHelper.info('🛡️ Sécurité Invite', [
                `Statut: ${current.enabled ? '✅ Activé' : '❌ Désactivé'}`,
                `Owners autorisés: ${current.whitelist?.length || 0} ID(s)`,
                '',
                `\`${prefix}secur-invite on <owner_id>\``,
                `\`${prefix}secur-invite off\``,
            ].join('\n'))] });
        }

        if (status === 'on') {
            const ownerId = args[1];
            if (!ownerId) {
                const prefix = message.guildSettings?.prefix || client.prefix;
                return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${prefix}secur-invite on <owner_id>\``)] });
            }
            client.securInvite = { enabled: true, whitelist: [ownerId] };
            return message.channel.send({ embeds: [EmbedHelper.success(`Sécurité invite activée. Owner: \`${ownerId}\`.`)] });
        }

        client.securInvite = { enabled: false, whitelist: [] };
        message.channel.send({ embeds: [EmbedHelper.success('Sécurité invite désactivée.')] });
    },
};
