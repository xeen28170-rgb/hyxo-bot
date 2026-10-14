'use strict';

const PermissionsHelper = require('./permissions');
const { isWhitelisted } = require('./whitelist');
const PrivateVoice = require('../models/PrivateVoice');
const { ChannelType, OverwriteType, PermissionFlagsBits } = require('discord.js');
const { mapLimit } = require('./concurrency');
const Logger = require('./logger');

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
    if (!member) return LEVEL.MEMBER;
    if (PermissionsHelper.isCreator(member.id) || PermissionsHelper.isProprietaire(member.id) || client.botOwners?.has(member.id)) return LEVEL.BOT_OWNER;
    const owners = settings?.owners || [];
    if (owners.includes(member.id) || client.owners?.has(member.id)) return LEVEL.OWNER;
    if (Array.isArray(settings?.ownerRoles) && settings.ownerRoles.some(roleId => member.roles?.cache?.has(roleId))) return LEVEL.OWNER;
    const wl = settings?.antiraid?.whitelist || [];
    const whitelisted = await isWhitelisted(member, member.id, wl);
    return whitelisted ? LEVEL.WL : LEVEL.MEMBER;
}

// Règles de protection des commandes de laisse.
// Hiérarchie bot stricte : propriétaire bot > Owner > WL > membre.
async function canLeashTarget(client, executor, target, settings) {
    const executorLevel = await getAccessLevel(client, executor, settings);
    const targetLevel = await getAccessLevel(client, target, settings);
    if (executorLevel < LEVEL.WL) return false;
    if (executorLevel === LEVEL.BOT_OWNER) return true;
    if (executor.id === target.id) return false;
    return executorLevel > targetLevel;
}

async function canManageRankRole(client, executor, role, settings) {
    const roleLevel = settings?.ownerRoles?.includes(role.id) ? LEVEL.OWNER
        : settings?.antiraid?.whitelist?.includes(role.id) ? LEVEL.WL : LEVEL.MEMBER;
    if (roleLevel === LEVEL.MEMBER) return true;
    return await getAccessLevel(client, executor, settings) > roleLevel;
}

function isRankRole(role, settings) {
    return Boolean(settings?.ownerRoles?.includes(role.id) || settings?.antiraid?.whitelist?.includes(role.id));
}

function canJoinPrivateVoiceByLevel(ownerLevel, joinerLevel) {
    if (joinerLevel === LEVEL.BOT_OWNER) return true;
    if (ownerLevel >= LEVEL.WL) return joinerLevel >= LEVEL.OWNER;
    return false;
}
// Peut gérer un PV : le propriétaire du salon, ou un Owner / bot owner.
async function canManagePrivateVoice(client, member, pv, settings) {
    if (!pv || !member) return false;
    if (pv.ownerId === member.id) return true;
    const level = await getAccessLevel(client, member, settings);
    return level >= LEVEL.OWNER;
}

// Renvoie tous les IDs des propriétaires du bot (CREATOR_IDS + client.owners + client.botOwners).
function getBotOwnerIds(client) {
    const ids = new Set();
    for (const raw of [process.env.BOT_PROPRIETAIRE_ID, process.env.CREATOR_IDS || process.env.OWNER_IDS]) {
        for (const id of (raw || '').split(',').map(value => value.trim()).filter(Boolean)) ids.add(id);
    }
    for (const id of (client.botOwners || [])) ids.add(String(id));
    for (const id of (client.owners || [])) ids.add(String(id));
    return [...ids];
}

// Applique les permissions pour rendre le salon vocal privé.
// Règles :
//   Propriétaire bot PV / Owner PV → Owners + Propriétaires peuvent entrer (WL et Gens non)
//   WL PV → Owners + Propriétaires peuvent entrer (Gens non)
// Renvoie le record PV créé (avec les ids d'overrides à nettoyer).
async function applyPrivateVoice(client, channel, member, settings) {
    const level = await getAccessLevel(client, member, settings);
    if (channel.type !== ChannelType.GuildVoice) throw new Error('Salon vocal requis.');
    if (level < LEVEL.WL) throw new Error('Rang WL minimum requis.');

    const existing = await PrivateVoice.findOne({ channelId: channel.id });
    if (existing) {
        // Auto-guérison : si le salon n'est en réalité plus restreint (@everyone peut se
        // connecter), l'enregistrement est un résidu d'une restauration ratée précédente
        // (ex: salon temporaire supprimé pendant la restauration, cf restorePublicVoice).
        // On purge l'enregistrement fantôme et on continue au lieu de bloquer =pv avec un
        // faux "déjà privé".
        const everyoneOverwrite = channel.permissionOverwrites.cache.get(channel.guild.id);
        const stillPrivate = everyoneOverwrite?.deny?.has(PermissionFlagsBits.Connect);
        if (stillPrivate) throw new Error('Ce salon est deja prive.');
        await PrivateVoice.deleteOne({ channelId: channel.id });
    }

    const overriddenIds = [];
    const originalOverwrites = Object.fromEntries(channel.permissionOverwrites.cache.map(overwrite => [overwrite.id, {
        id: overwrite.id, type: overwrite.type, allow: overwrite.allow.bitfield.toString(), deny: overwrite.deny.bitfield.toString(),
    }]));
    try {
        // Neutraliser les anciennes exceptions de connexion avant d'appliquer les rangs.
        // En parallèle (limite 5) : un salon avec beaucoup d'overwrites existants
        // (rôles, membres) pouvait faire trainer =pv plusieurs secondes en séquentiel.
        const existingOverwrites = [...channel.permissionOverwrites.cache.values()].filter(overwrite => overwrite.id !== channel.guild.id);
        await mapLimit(existingOverwrites, async (overwrite) => {
            await channel.permissionOverwrites.edit(overwrite.id, { Connect: null, ViewChannel: null }, { type: overwrite.type });
            overriddenIds.push(overwrite.id);
        }, 5);
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: false, ViewChannel: true });
        overriddenIds.push(channel.guild.id);

        // Toujours laisser le propriétaire du salon entrer.
        await channel.permissionOverwrites.edit(member.id, { Connect: true, ViewChannel: true });
        overriddenIds.push(member.id);

        // Les Owners et propriétaires du bot peuvent toujours entrer ; les autres via =acces.
        // Le type (0 = rôle, 1 = membre) est précisé : sans lui, discord.js refuse un ID
        // absent de son cache et l'Owner restait bloqué sans aucune erreur visible.
        const allowed = new Map();
        for (const id of settings.owners || []) allowed.set(String(id), OverwriteType.Member);
        for (const id of getBotOwnerIds(client)) allowed.set(id, OverwriteType.Member);
        for (const id of settings.ownerRoles || []) allowed.set(String(id), OverwriteType.Role);
        allowed.delete(member.id); // déjà autorisé ci-dessus

        await mapLimit([...allowed], async ([id, type]) => {
            await channel.permissionOverwrites.edit(id, { Connect: true, ViewChannel: true }, { type });
            overriddenIds.push(id);
        }, 5);

        const pv = await PrivateVoice.create({
            channelId: channel.id,
            guildId: channel.guild.id,
            ownerId: member.id,
            ownerTag: member.user?.tag || '',
            accessLevel: levelName(level),
            permitted: [],
            overriddenIds,
            originalOverwrites,
        });

        // Les personnes déjà dans le vocal y restent : accès temporaire, retiré dès qu'elles
        // le quittent (voiceStateUpdate). Pour revenir ensuite, il leur faudra =acces.
        const present = [];
        for (const occupant of channel.members.values()) {
            if (occupant.id === member.id || occupant.user.bot) continue;
            if (canJoinPrivateVoiceByLevel(level, await getAccessLevel(client, occupant, settings))) continue;
            await channel.permissionOverwrites.edit(occupant.id, { Connect: true, ViewChannel: true }, { type: OverwriteType.Member });
            overriddenIds.push(occupant.id);
            present.push(occupant.id);
        }
        if (present.length) await PrivateVoice.updateOne({ channelId: channel.id }, { $set: { present, overriddenIds } });

        return { pv, level };
    } catch (error) {
        await restorePublicVoice(channel, { originalOverwrites, overriddenIds });
        await PrivateVoice.deleteOne({ channelId: channel.id });
        throw error;
    }
}

// Rend le salon publique et purge toutes les permissions spécifiques du PV.
// (La suppression du salon vide, si tempvoice, est gérée par voiceStateUpdate.)
/**
 * Une personne qui était déjà dans le vocal au moment du =pv vient de le quitter :
 * son accès temporaire est retiré (sauf si elle a reçu =acces entre-temps).
 */
async function revokeTemporaryAccess(channel, pvRecord, memberId) {
    if (!pvRecord?.present?.includes(memberId) || pvRecord.permitted?.includes(memberId)) return false;
    const original = pvRecord.originalOverwrites?.[memberId];
    if (channel?.permissionOverwrites) {
        if (original) {
            const flag = bit => ((BigInt(original.allow) & bit) !== 0n ? true : (BigInt(original.deny) & bit) !== 0n ? false : null);
            await channel.permissionOverwrites.edit(memberId, { Connect: flag(PermissionFlagsBits.Connect), ViewChannel: flag(PermissionFlagsBits.ViewChannel) }, { type: original.type }).catch(() => {});
        } else if (channel.permissionOverwrites.cache.has(memberId)) {
            await channel.permissionOverwrites.delete(memberId).catch(() => {});
        }
    }
    await PrivateVoice.updateOne({ channelId: pvRecord.channelId }, { $pull: { present: memberId, overriddenIds: memberId } });
    return true;
}

async function restorePublicVoice(channel, pvRecord) {
    if (!channel || channel.deleted) return;
    if (pvRecord?.originalOverwrites) {
        // En parallèle (limite 5) : restaurer un par un pouvait bloquer plusieurs secondes.
        const restored = await mapLimit([...new Set([...(pvRecord.overriddenIds || []), ...(pvRecord.permitted || [])])], async (id) => {
            const original = pvRecord.originalOverwrites[id];
            if (original) {
                await channel.permissionOverwrites.edit(id, {
                    Connect: (BigInt(original.allow) & PermissionFlagsBits.Connect) !== 0n ? true : (BigInt(original.deny) & PermissionFlagsBits.Connect) !== 0n ? false : null,
                    ViewChannel: (BigInt(original.allow) & PermissionFlagsBits.ViewChannel) !== 0n ? true : (BigInt(original.deny) & PermissionFlagsBits.ViewChannel) !== 0n ? false : null,
                }, { type: original.type });
            } else if (channel.permissionOverwrites.cache.has(id)) {
                await channel.permissionOverwrites.delete(id);
            }
        }, 5);
        // Un salon supprimé pendant la restauration (ex: salon temporaire vidé en parallèle
        // par le nettoyage tempvoc, cf voiceStateUpdate.js) ne doit plus faire échouer toute
        // la fonction : avant, un throw ici empêchait l'appelant de purger l'enregistrement PV,
        // qui restait "déjà privé" pour toujours sur un salon qui n'existe même plus.
        const failure = restored.find(result => !result.ok);
        if (failure) Logger.warn(`[PrivateVoice] Restauration partielle sur ${channel.id}: ${failure.error?.message}`);
        return;
    }
    if (channel.permissionOverwrites) {
        try {
            await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: null, ViewChannel: null }).catch(() => {});
        } catch { /* salon supprimé */ }
    }
    const ids = pvRecord?.overriddenIds || [];
    await mapLimit(ids, async (id) => {
        if (!id) return;
        // @everyone déjà réinitialisé ci-dessus.
        if (id === channel.guild?.id) return;
        if (channel.permissionOverwrites?.cache?.has(id)) {
            await channel.permissionOverwrites.delete(id).catch(() => {});
        }
    }, 5);
}

module.exports = {
    LEVEL,
    levelName,
    getAccessLevel,
    canLeashTarget,
    canManageRankRole,
    isRankRole,
    canJoinPrivateVoiceByLevel,
    canManagePrivateVoice,
    applyPrivateVoice,
    restorePublicVoice,
    revokeTemporaryAccess,
    PrivateVoice,
};
