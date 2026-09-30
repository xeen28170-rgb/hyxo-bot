'use strict';

const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const Leash = require('../../models/Leash');
const PrisonService = require('../../services/prisonService');
const Logger = require('../../utils/logger');

async function handleLeashNick(client, oldMember, newMember) {
    try {
        // Si la personne est tenue en laisse sur ce serveur, elle ne peut pas
        // changer son pseudo.
        const leash = await Leash.get({ userId: newMember.id });
        if (!leash?.forcedNick) return;
        if (!(leash.guildIds || []).includes(newMember.guild.id)) return;
        if (newMember.nickname === leash.forcedNick) return;
        await newMember.setNickname(leash.forcedNick, 'Laisse: pseudo protégé').catch(() => {});
    } catch { /* ignore */ }
}


async function handlePrisonRoleGuard(client, oldMember, newMember) {
    try {
        if (!oldMember.roles.cache.some(role => !newMember.roles.cache.has(role.id))) return;
        await PrisonService.restorePrisonRole(client, newMember);
    } catch (error) {
        Logger.error('[Prison] Echec de restauration du role:', error.message);
    }
}

module.exports = {
    name: 'guildMemberUpdate',
    async run(client, oldMember, newMember) {
        const guild = oldMember.guild;

        await Promise.all([
            handleLeashNick(client, oldMember, newMember),
            handlePrisonRoleGuard(client, oldMember, newMember),
        ]);

        if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
            scheduleStatsUpdate(client, guild, 'roles', 15_000);
            const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
            const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

            if (added.size > 0 || removed.size > 0) {
                const embed = EmbedHelper.info('🎭 Mise à jour Rôles', [
                    `**Membre:** ${newMember.user} (\`${newMember.id}\`)`,
                    added.size > 0 ? `**Ajouté:** ${added.map(r => r.toString()).join(', ')}` : '',
                    removed.size > 0 ? `**Retiré:** ${removed.map(r => r.toString()).join(', ')}` : '',
                ].filter(Boolean).join('\n'), { color: 0xFF0000 })
                    .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();
                await LogDispatcher.roles(guild, embed);
            }
        }

        const currentBoostCount = guild.premiumSubscriptionCount || 0;
        const cachedBoostCount = client.boostLogCache?.get(guild.id);
        if (cachedBoostCount === undefined) {
            client.boostLogCache?.set(guild.id, currentBoostCount);
        } else if (currentBoostCount > cachedBoostCount) {
            scheduleStatsUpdate(client, guild, 'boost', 15_000);
            const delta = Math.min(currentBoostCount - cachedBoostCount, 10);
            client.boostLogCache.set(guild.id, currentBoostCount);
            for (let index = 0; index < delta; index++) {
                const embed = EmbedHelper.info('🚀 Nouveau Boost', [
                    `**Membre:** ${newMember.user} (\`${newMember.id}\`)`,
                    `**Boosts serveur:** ${currentBoostCount}`,
                    delta > 1 ? `**Boost détecté:** ${index + 1}/${delta}` : '',
                    'Merci pour le boost !'
                ].filter(Boolean).join('\n'), { color: 0xFF0000 })
                    .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();
                await LogDispatcher.boost(guild, embed, {
                    dedupeKey: `boost:${guild.id}:${newMember.id}:${cachedBoostCount}:${currentBoostCount}:${index}`,
                });
            }
        } else if (currentBoostCount < cachedBoostCount) {
            client.boostLogCache.set(guild.id, currentBoostCount);
            scheduleStatsUpdate(client, guild, 'boost_remove', 15_000);
        }
    },
};
