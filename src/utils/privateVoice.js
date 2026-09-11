'use strict';

const PermissionsHelper = require('./permissions');
const { isWhitelisted } = require('./whitelist');
const PrivateVoice = require('../models/PrivateVoice');

const LEVEL = {
    MEMBER: 0,
    WL: 1,
    OWNER: 2,
    BOT_OWNER: 3,
};

function levelName(level) {
    switch (level) {
        case LEVEL.WL: return 'WL';
        case LEVEL.OWNER: return 'Owner';
        case LEVEL.BOT_OWNER: return 'Owner Bot';
        default: return 'Membre';
    }
}

async function getAccessLevel(client, member, settings) {
    if (PermissionsHelper.isBotOwner(client, member.id)) return LEVEL.BOT_OWNER;
    const owners = settings?.owners || [];
    if (owners.includes(member.id) || member.guild.ownerId === member.id) return LEVEL.OWNER;
    const wl = settings?.antiraid?.whitelist || [];
    const whitelisted = await isWhitelisted(member, member.id, wl);
    return whitelisted ? LEVEL.WL : LEVEL.MEMBER;
}

// Règles de protection des commandes de laisse.
// Seules les cibles de niveau « membre » peuvent être mises en laisse.
async function canLeashTarget(client, executor, target, settings) {
    const targetLevel = await getAccessLevel(client, target, settings);
    // Protections absolues : bot owner, owner et WL ne peuvent jamais se faire laisse.
    if (targetLevel >= LEVEL.WL) return false;

    // Un membre ne peut pas mettre en laisse.
    const executorLevel = await getAccessLevel(client, executor, settings);
    if (executorLevel < LEVEL.WL) return false;

    // Hiérarchie Discord de rôles (en plus du niveau métier).
    if (!PermissionsHelper.canTarget(executor, target)) return false;

    return true;
}

// Peut gérer un PV : le propriétaire du salon, ou un Owner / bot owner.
async function canManagePrivateVoice(client, member, pv, settings) {
    if (!pv || !member) return false;
    if (pv.ownerId === member.id) return true;
    const level = await getAccessLevel(client, member, settings);
    return level >= LEVEL.OWNER;
}

function wlRoleIdsAndUserIds(guild, settings) {
    const wl = settings?.antiraid?.whitelist || [];
    const roleIds = [];
    const userIds = [];
    for (const id of wl) {
        if (guild.roles.cache.has(id)) roleIds.push(id);
        else userIds.push(id);
    }
    return { roleIds, userIds };
}

// Applique les permissions pour rendre le salon vocal privé.
// Renvoie le record PV créé (avec les ids d'overrides à nettoyer).
async function applyPrivateVoice(client, channel, member, settings) {
    const level = await getAccessLevel(client, member, settings);

    const overriddenIds = [];
    // Blocage générique : @everyone ne peut plus Connect.
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: false, ViewChannel: true });
    overriddenIds.push(channel.guild.id);

    // Toujours laisser le propriétaire entrer.
    await channel.permissionOverwrites.edit(member.id, { Connect: true, ViewChannel: true });
    overriddenIds.push(member.id);

    // PV activé par un WL : tout membre WL peut rejoindre (les non-WL non).
    if (level === LEVEL.WL) {
        const { roleIds, userIds } = wlRoleIdsAndUserIds(channel.guild, settings);
        for (const roleId of roleIds) {
            await channel.permissionOverwrites.edit(roleId, { Connect: true, ViewChannel: true }).catch(() => {});
            overriddenIds.push(roleId);
        }
        for (const userId of userIds) {
            await channel.permissionOverwrites.edit(userId, { Connect: true, ViewChannel: true }).catch(() => {});
            overriddenIds.push(userId);
        }
    }

    // PV activé par un Owner / Bot owner : personne d'autre ne peut entrer (ni WL ni Owners).
    // PV activé par un membre : personne d'autre ne peut entrer.

    const pv = await PrivateVoice.create({
        channelId: channel.id,
        guildId: channel.guild.id,
        ownerId: member.id,
        ownerTag: member.user?.tag || '',
        accessLevel: levelName(level),
        permitted: [],
        overriddenIds,
    });

    return { pv, level };
}

// Rend le salon publique et purge toutes les permissions spécifiques du PV.
// (La suppression du salon vide, si tempvoice, est gérée par voiceStateUpdate.)
async function restorePublicVoice(channel, pvRecord) {
    if (!channel) return;
    if (channel.permissionOverwrites) {
        try {
            await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: null, ViewChannel: null }).catch(() => {});
        } catch { /* salon supprimé */ }
    }
    const ids = pvRecord?.overriddenIds || [];
    for (const id of ids) {
        if (!id) continue;
        // @everyone déjà réinitialisé ci-dessus.
        if (id === channel.guild?.id) continue;
        if (channel.permissionOverwrites?.cache?.has(id)) {
            await channel.permissionOverwrites.delete(id).catch(() => {});
        }
    }
}

module.exports = {
    LEVEL,
    levelName,
    getAccessLevel,
    canLeashTarget,
    canManagePrivateVoice,
    applyPrivateVoice,
    restorePublicVoice,
    PrivateVoice,
};
