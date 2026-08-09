'use strict';

const AntiraidService = require('../../services/antiraidService');
const Logger = require('../../utils/logger');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'guildAuditLogEntryCreate',
    once: false,
    async run(client, auditLog, guild) {
        if (!guild) return;
        try {
            const settings = await getGuildSettings(client, guild.id, { create: false });

            if (!settings?.antiraid?.enabled) return;

            const executorId = auditLog.executorId;
            if (!executorId) return;

            await AntiraidService.handleAuditLog(client, guild, auditLog, settings);

        } catch (error) {
            Logger.error('Erreur guildAuditLogEntryCreate:', { message: error.message });
        }
    },
};
