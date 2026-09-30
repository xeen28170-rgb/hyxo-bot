'use strict';

const BackupService = require('./backupService');
const Guild = require('../models/Guild');
const { getGuildSettings, invalidateGuildSettings } = require('../utils/guildSettings');
const { withKey } = require('../utils/keyedQueue');
const Logger = require('../utils/logger');

module.exports = {
    async process(client, now = Date.now()) {
        for (const guild of client.guilds.cache.values()) {
            for (const kind of ['server', 'emoji']) {
                try {
                    await withKey(`autobackup:${guild.id}:${kind}`, async () => {
                        const settings = await getGuildSettings(client, guild.id, { create: false });
                        const days = Number(settings?.autobackup?.[`${kind}Interval`]);
                        if (!Number.isFinite(days) || days < 1) return;
                        const last = Number(settings.autobackup[`${kind}LastAt`] || 0);
                        if (last && now - last < days * 86400000) return;
                        await BackupService.create(guild, client.user.id, kind);
                        await Guild.updateOne({ guildId: guild.id }, { [`autobackup.${kind}LastAt`]: now });
                        invalidateGuildSettings(client, guild.id);
                    });
                } catch (error) { Logger.error(`[Autobackup] ${guild.id}/${kind}:`, error.message); }
            }
        }
    },
};
