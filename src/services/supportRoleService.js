'use strict';

const { ActivityType } = require('discord.js');
const Guild = require('../models/Guild');
const Permissions = require('../utils/permissions');
const { isRankRole } = require('../utils/privateVoice');
const { getGuildSettings, invalidateGuildSettings } = require('../utils/guildSettings');
const { withKey } = require('../utils/keyedQueue');

module.exports = {
    async onPresence(client, presence) {
        if (!presence?.guild || presence.status === 'offline') return;
        const guild = presence.guild;
        const userId = presence.userId || presence.member?.id;
        if (!userId) return;
        // File par membre (et non par serveur) : un seul changement de statut lent ne doit pas
        // bloquer les milliers d'autres événements de présence du serveur derrière lui.
        return withKey(`support:${guild.id}:${userId}`, async () => {
            const settings = await getGuildSettings(client, guild.id);
            const support = settings.config?.soutien;
            if (!support?.roleId || !support.statusText) return;
            const role = guild.roles.cache.get(support.roleId);
            if (!role || isRankRole(role, settings) || !Permissions.isSafeSelfAssignableRole(role) || !Permissions.botCanManageRole(guild, role)) return;
            const member = presence.member || await guild.members.fetch(userId);
            if (member.user.bot) return;
            const matches = presence.activities?.some(a => a.type === ActivityType.Custom && a.state?.includes(support.statusText));
            if (matches && !member.roles.cache.has(role.id)) {
                await member.roles.add(role, 'Statut de soutien');
                await Guild.updateOne({ guildId: guild.id }, { $addToSet: { 'config.soutien.granted': userId } });
                invalidateGuildSettings(client, guild.id);
            } else if (!matches && support.granted?.includes(userId)) {
                await member.roles.remove(role, 'Statut de soutien retire');
                await Guild.updateOne({ guildId: guild.id }, { $pull: { 'config.soutien.granted': userId } });
                invalidateGuildSettings(client, guild.id);
            }
        });
    },
    async cleanup(guild, support) {
        for (const id of support?.granted || []) {
            const member = await guild.members.fetch(id).catch(error => {
                if (error.code === 10007) return null;
                throw error;
            });
            if (member?.roles.cache.has(support.roleId)) await member.roles.remove(support.roleId, 'Soutien reconfigure');
        }
    },
};
