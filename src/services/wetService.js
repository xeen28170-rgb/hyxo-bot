'use strict';

/**
 * Wet : la personne est bannie de tous les serveurs où est le bot, et rebannie si elle
 * revient (arrivée sur un serveur, ou vérification toutes les 5 minutes). Contrairement à
 * la blacklist, le bot ne l'ignore pas. Réservé au propriétaire du bot (&wet / &unwet).
 */

const Wet = require('../models/Wet');
const BlacklistService = require('./blacklistService');
const { mapLimit } = require('../utils/concurrency');

module.exports = {
    async enforceUser(client, userId) {
        const entry = await Wet.findOne({ userId });
        const result = { banned: 0, failed: 0 };
        if (!entry) return result;
        await mapLimit([...client.guilds.cache.values()], async (guild) => {
            if (await BlacklistService.enforceGuild(guild, entry, 'Wet')) result.banned++;
            else result.failed++;
        }, 5);
        return result;
    },

    async enforceAll(client) {
        for (const entry of await Wet.find()) await this.enforceUser(client, entry.userId);
    },

    /** Nouveau serveur rejoint par le bot : toutes les personnes wet y sont bannies. */
    async enforceGuild(guild) {
        for (const entry of await Wet.find()) await BlacklistService.enforceGuild(guild, entry, 'Wet');
    },

    async onJoin(member) {
        const entry = await Wet.findOne({ userId: member.id });
        if (!entry) return false;
        await BlacklistService.enforceGuild(member.guild, entry, 'Wet');
        return true;
    },

    /** Retire la personne de la liste et la débannit de tous les serveurs. */
    async unwetUser(client, userId, moderatorTag) {
        await Wet.findOneAndDelete({ userId });
        const result = { unbanned: 0, failed: 0 };
        await mapLimit([...client.guilds.cache.values()], async (guild) => {
            const ban = await guild.bans.fetch(userId).catch(() => null);
            if (!ban) return;
            try {
                await guild.bans.remove(userId, `[Unwet] par ${moderatorTag}`);
                result.unbanned++;
            } catch {
                result.failed++;
            }
        }, 5);
        return result;
    },
};
