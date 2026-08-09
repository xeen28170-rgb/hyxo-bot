'use strict';

const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const AntiraidService = require('../../services/antiraidService');
const { AuditLogEvent } = require('discord.js');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'roleCreate',
    async run(client, role) {
        const settings = await getGuildSettings(client, role.guild.id);
        await AntiraidService.handleRecentAuditAction(client, role.guild, AuditLogEvent.RoleCreate, role.id, settings);
        if (await LogDispatcher.isSelfAuditAction(client, role.guild, AuditLogEvent.RoleCreate, role.id)) return;

        const embed = EmbedHelper.info('🆕 Rôle Créé', [
            `**Nom:** ${role.name}`,
            `**ID:** \`${role.id}\``,
            `**Couleur:** ${role.hexColor}`
        ].join('\n'), { color: 0x00FF00 });

        await LogDispatcher.roles(role.guild, embed);
    },
};
