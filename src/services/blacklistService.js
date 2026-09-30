'use strict';

const Blacklist = require('../models/Blacklist');
const Logger = require('../utils/logger');
const { mapLimit } = require('../utils/concurrency');

// Anti-spam : le code d'erreur Discord 50013 ("Missing Permissions") sur un ban
// signifie que le bot n'a pas la permission Ban Members OU que sa position de
// rôle est trop basse par rapport au membre ciblé sur CE serveur. Le cron tourne
// toutes les 5 minutes : sans limite, une seule guild bloquée spamme le log
// indéfiniment. On tente quand même le ban à chaque cycle (si la permission est
// corrigée côté Discord, ça repasse tout seul), mais on ne relogue l'avertissement
// que toutes les 6h par serveur.
const PERM_WARNING_INTERVAL_MS = 6 * 60 * 60 * 1000;
const lastPermWarning = new Map(); // guildId -> timestamp du dernier avertissement loggué

module.exports = {
    async isBlocked(userId) {
        return Boolean(await Blacklist.findOne({ userId }));
    },
    async enforceGuild(guild, entry) {
        try {
            const ban = await guild.bans.fetch(entry.userId).catch(error => {
                if (error.code === 10026) return null;
                throw error;
            });
            if (!ban) await guild.members.ban(entry.userId, { reason: `[Blacklist] ${entry.reason || 'Blacklist globale'}`.slice(0, 512) });
            return true;
        } catch (error) {
            if (error.code === 50013) {
                const last = lastPermWarning.get(guild.id) || 0;
                if (Date.now() - last > PERM_WARNING_INTERVAL_MS) {
                    lastPermWarning.set(guild.id, Date.now());
                    Logger.warn(`[Blacklist] Permission Ban Members manquante ou hiérarchie de rôle insuffisante sur ${guild.name} (${guild.id}) — nouvel essai silencieux toutes les 5 min, prochain avertissement dans 6h.`);
                }
                return false;
            }
            // error.message était passé comme 2e argument à Logger.error, qui l'attend sous
            // forme d'objet (meta) pour Winston : une simple string y est ignorée et le détail
            // de l'erreur n'apparaissait jamais dans les logs. On l'inclut directement dans le message.
            Logger.error(`[Blacklist] Echec sur ${guild.id} pour ${entry.userId}: ${error.message}`);
            return false;
        }
    },
    async enforceUser(client, userId) {
        const entry = await Blacklist.findOne({ userId });
        const result = { banned: 0, failed: 0 };
        if (!entry) return result;
        // Serveurs traités 5 par 5 : en série, chaque serveur ajoutait un bans.fetch + un ban
        // et la commande -bl mettait de nombreuses secondes à répondre.
        await mapLimit([...client.guilds.cache.values()], async (guild) => {
            if (await this.enforceGuild(guild, entry)) result.banned++;
            else result.failed++;
        }, 5);
        return result;
    },
    async enforceAll(client) {
        for (const entry of await Blacklist.find()) await this.enforceUser(client, entry.userId);
    },
    async onJoin(member) {
        const entry = await Blacklist.findOne({ userId: member.id });
        if (!entry) return false;
        await this.enforceGuild(member.guild, entry);
        return true;
    },
};
