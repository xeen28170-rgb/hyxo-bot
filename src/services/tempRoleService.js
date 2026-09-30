'use strict';

const TempRole = require('../models/TempRole');
const Logger = require('../utils/logger');
const { withKey } = require('../utils/keyedQueue');

module.exports = {
    async expire(client, query) {
        return withKey(`temprole:${query.guildId}:${query.userId}:${query.roleId}`, async () => {
            const record = await TempRole.findOne(query);
            if (!record || new Date(record.expiresAt).getTime() > Date.now()) return;
            if (!Number.isFinite(new Date(record.expiresAt).getTime())) throw new Error('Echeance de role temporaire invalide');
            const guild = client.guilds.cache.get(record.guildId);
            if (!guild) return;
            let member;
            try { member = await guild.members.fetch(record.userId); } catch (error) {
                if (error.code !== 10007) throw error;
            }
            if (member?.roles.cache.has(record.roleId)) await member.roles.remove(record.roleId, 'Role temporaire expire');
            await TempRole.remove(query);
        });
    },
    async processExpired(client) {
        for (const record of await TempRole.getExpired()) {
            try { await this.expire(client, record); } catch (error) { Logger.error('[TempRole] Expiration a reessayer:', error.message); }
        }
    },
};
