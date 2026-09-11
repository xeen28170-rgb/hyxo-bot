'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'timeout',
    category: 'moderation_config',
    description: 'Active/désactive l\'utilisation du Timeout Discord au lieu du rôle mute (max 28 jours)',
    usage: '-timeout <on/off>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const status = args[0]?.toLowerCase();
        if (!status || !['on', 'off'].includes(status)) {
            const prefix = message.guildSettings?.prefix || client.prefix;
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${prefix}timeout <on/off>\``)] });
        }

        const enabled = status === 'on';
        await Guild.updateOne({ guildId: message.guild.id }, { 'moderation.useTimeout': enabled });
        client.cache.invalidateGuild(message.guild.id);

        message.channel.send({ embeds: [EmbedHelper.success(`L'utilisation des Timeouts Discord est désormais **${enabled ? 'activée ✅' : 'désactivée ❌'}**.\n${enabled ? '> Le bot utilisera le timeout natif Discord pour les mutes.' : '> Le bot utilisera le rôle mute configuré.'}`)] });
    },
};
