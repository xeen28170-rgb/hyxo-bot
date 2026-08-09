'use strict';

const { AuditLogEvent } = require('discord.js');
const AntiraidService = require('../../services/antiraidService');
const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'channelCreate',
    async run(client, channel) {
        if (!channel.guild) return;
        const settings = await getGuildSettings(client, channel.guild.id);
        await AntiraidService.handleRecentAuditAction(client, channel.guild, AuditLogEvent.ChannelCreate, channel.id, settings);
        if (await LogDispatcher.isSelfAuditAction(client, channel.guild, AuditLogEvent.ChannelCreate, channel.id)) return;

        const embed = EmbedHelper.info('📁 Salon créé', [
            `**Nom:** ${channel.name}`,
            `**ID:** \`${channel.id}\``,
            `**Type:** \`${channel.type}\``,
        ].join('\n'), { color: 0x57F287 });
        await LogDispatcher.channels(channel.guild, embed);
    },
};
