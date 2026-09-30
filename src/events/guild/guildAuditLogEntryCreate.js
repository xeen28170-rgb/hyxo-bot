'use strict';

const { AuditLogEvent } = require('discord.js');
const AntiraidService = require('../../services/antiraidService');
const Logger = require('../../utils/logger');
const LogDispatcher = require('../../utils/logDispatcher');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'guildAuditLogEntryCreate',
    once: false,
    async run(client, auditLog, guild) {
        if (!guild) return;
        LogDispatcher.recordAuditEntry(guild.id, auditLog);
        try {
            const settings = await getGuildSettings(client, guild.id, { create: false });

            // Protection anti-down URL serveur (vanity) : whitelist incluses = ban
            if (auditLog?.action === AuditLogEvent.GuildUpdate && settings?.antidown?.enabled) {
                await AntiraidService.handleGuildUpdate(client, guild, auditLog, settings);
            }

            if (!settings?.antiraid?.enabled) return;

            const executorId = auditLog.executorId;
            if (!executorId) return;

            await AntiraidService.handleAuditLog(client, guild, auditLog, settings);

        } catch (error) {
            Logger.error('Erreur guildAuditLogEntryCreate:', { message: error.message });
        }
    },
};
