'use strict';

const Leash = require('../models/Leash');

const NICK_MAX = 32;
const DOG_EMOJI = '🐕';

function buildForcedNick(followerUsername) {
    const prefix = 'chienne de ';
    const suffix = DOG_EMOJI;
    const room = NICK_MAX - (prefix.length + suffix.length);
    const name = String(followerUsername || 'maître').slice(0, room);
    return `${prefix}${name}${suffix}`;
}

async function sharedGuildIds(client, followerId, userId) {
    const ids = [];
    for (const [, guild] of client.guilds.cache) {
        const hasFollower = guild.members.cache.has(followerId);
        const hasTarget = guild.members.cache.has(userId);
        if (hasFollower && hasTarget) ids.push(guild.id);
    }
    return ids;
}

async function applyNick(guild, userId, nick, reason) {
    try {
        const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
        if (!member) return;
        if (member.nickname === nick) return;
        await member.setNickname(nick, reason).catch(() => {});
    } catch { /* serveur inaccessible */ }
}

async function startLeash(client, follower, target) {
    const forcedNick = buildForcedNick(follower.displayName);
    const guildIds = await sharedGuildIds(client, follower.id, target.id);

    // Enregistrer le pseudo original par serveur AVANT de le forcer.
    const originalNicks = {};
    for (const gid of guildIds) {
        const guild = client.guilds.cache.get(gid);
        if (!guild) continue;
        const m = guild.members.cache.get(target.id) || await guild.members.fetch(target.id).catch(() => null);
        if (m) originalNicks[gid] = m.nickname || null;
    }

    await Leash.create({
        userId: target.id,
        followerId: follower.id,
        userTag: follower.displayName,
        forcedNick,
        originalNicks,
        guildIds,
    });

    for (const gid of guildIds) {
        const guild = client.guilds.cache.get(gid);
        if (guild) await applyNick(guild, target.id, forcedNick, `Laisse par ${follower.displayName}`);
    }

    return { forcedNick, guildIds };
}

async function stopLeash(client, target, guildId) {
    const leash = await Leash.get({ userId: target.id });
    if (!leash) return null;

    // Supprimer la laisse AVANT de restaurer les pseudos : pendant la
    // restauration, setNickname déclenche guildMemberUpdate -> handleLeashNick,
    // qui réappliquait le pseudo forcé tant que la laisse existait encore.
    await Leash.remove({ userId: target.id });

    const guilds = new Set(leash.guildIds || []);
    if (guildId) guilds.add(guildId);

    for (const gid of guilds) {
        const guild = client.guilds.cache.get(gid);
        if (!guild) continue;
        const original = leash.originalNicks?.[gid];
        if (original !== undefined) {
            await applyNick(guild, target.id, original, 'Unlaisse: restauration du pseudo');
        } else {
            await applyNick(guild, target.id, null, 'Unlaisse: restauration du pseudo');
        }
    }

    return leash;
}

async function getLeash(client, userId) {
    return Leash.get({ userId });
}

async function listLeashes() {
    return Leash.find();
}

module.exports = {
    buildForcedNick,
    startLeash,
    stopLeash,
    getLeash,
    listLeashes,
};
