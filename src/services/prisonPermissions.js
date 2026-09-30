'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const Guild = require('../models/Guild');
const { getGuildSettings, invalidateGuildSettings } = require('../utils/guildSettings');
const { mapLimit } = require('../utils/concurrency');

function state(overwrite, name) {
    const bit = PermissionFlagsBits[name];
    return overwrite?.allow.has(bit) ? true : overwrite?.deny.has(bit) ? false : null;
}

function desired(channel, prison) {
    const inside = [prison.categoryId, prison.jailChannelId, prison.voiceChannelId].includes(channel.id)
        || Boolean(prison.categoryId && channel.parentId === prison.categoryId);
    const permissions = { ViewChannel: inside };
    if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
        permissions.Connect = inside;
        permissions.Speak = inside;
    }
    return permissions;
}

module.exports = {
    async apply(client, guild, userId, onlyChannel) {
        const settings = await getGuildSettings(client, guild.id, { create: false, useCache: false });
        const prison = settings?.prison;
        if (!prison?.prisoners?.includes(userId)) return;
        const channels = onlyChannel ? [onlyChannel] : [...guild.channels.cache.values()];
        // En parallèle (limite 5) plutôt qu'un salon à la fois : sur un serveur
        // avec beaucoup de salons, la version séquentielle pouvait prendre plusieurs
        // dizaines de secondes avant que la commande ne réponde.
        await mapLimit(channels, async (channel) => {
            if (channel.isThread?.() || !channel.permissionOverwrites) return;
            const permissions = desired(channel, prison);
            const existing = channel.permissionOverwrites.cache.get(userId);
            const saved = prison.memberOverwrites?.[userId]?.[channel.id];
            if (!saved) {
                const snapshot = { existed: Boolean(existing), permissions: Object.fromEntries(Object.keys(permissions).map(name => [name, state(existing, name)])) };
                await Guild.updateOne({ guildId: guild.id }, { $set: { [`prison.memberOverwrites.${userId}.${channel.id}`]: snapshot } });
                invalidateGuildSettings(client, guild.id);
            }
            if (Object.entries(permissions).some(([name, value]) => state(existing, name) !== value)) {
                await channel.permissionOverwrites.edit(userId, permissions, { type: 1, reason: 'Prison: isolation du membre' });
            }
        }, 5);
    },

    async restore(client, guild, userId) {
        const settings = await getGuildSettings(client, guild.id, { create: false, useCache: false });
        const snapshots = settings?.prison?.memberOverwrites?.[userId] || {};
        await mapLimit(Object.entries(snapshots), async ([channelId, snapshot]) => {
            const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(error => {
                if (error.code === 10003) return null;
                throw error;
            });
            if (!channel?.permissionOverwrites) return;
            const existing = channel.permissionOverwrites.cache.get(userId);
            if (!existing && !snapshot.existed) return;
            await channel.permissionOverwrites.edit(userId, snapshot.permissions, { type: 1, reason: 'Prison: restauration des acces' });
            const restored = channel.permissionOverwrites.cache.get(userId);
            if (!snapshot.existed && restored && restored.allow.bitfield === 0n && restored.deny.bitfield === 0n) {
                await channel.permissionOverwrites.delete(userId);
            }
        }, 5);
    },
    desired,
};
