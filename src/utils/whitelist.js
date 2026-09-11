'use strict';

/**
 * Vérifie si un membre est whitelisté.
 *
 * La whitelist antiraid contient indifféremment des user-IDs ou des role-IDs.
 * Cette fonction accepte :
 *  - soit un `member` Discord déjà chargé (obj.roles.cache) — aucun fetch réseau,
 *  - soit un `guild` Discord + un `memberId` — résout le membre à la demande.
 *
 * @param {object} memberOrGuild Member Discord ou Guild Discord
 * @param {string} memberId      ID du membre (ignoré si member passé)
 * @param {string[]} whitelist   Liste d'IDs (utilisateurs et/ou rôles)
 * @returns {Promise<boolean>}
 */
async function isWhitelisted(memberOrGuild, memberId, whitelist) {
    if (!Array.isArray(whitelist) || whitelist.length === 0) return false;
    const ids = new Set(whitelist.map(id => String(id)));
    if (ids.has(String(memberId))) return true;

    let member = null;
    if (memberOrGuild && typeof memberOrGuild.roles?.cache?.keys === 'function') {
        // Member déjà chargé — pas de fetch réseau.
        member = memberOrGuild;
    } else if (memberOrGuild && memberId && typeof memberOrGuild.members?.fetch === 'function') {
        try {
            member = await memberOrGuild.members.fetch(memberId);
        } catch {
            member = null;
        }
    }

    if (member && ids.has(String(member.id))) return true;
    if (member?.roles?.cache && typeof member.roles.cache.keys === 'function') {
        for (const roleId of member.roles.cache.keys()) {
            if (ids.has(String(roleId))) return true;
        }
    }
    return false;
}

module.exports = { isWhitelisted };
