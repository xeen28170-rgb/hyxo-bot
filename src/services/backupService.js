'use strict';

const Backup = require('../models/Backup');
const Helpers = require('../utils/helpers');
const Logger = require('../utils/logger');
const Guild = require('../models/Guild');
const { getGuildSettings, invalidateGuildSettings } = require('../utils/guildSettings');

const BackupService = {
    /**
     * Créer un backup du serveur (structure + configuration)
     */
    async create(guild, userId) {
        try {
            const settings = await getGuildSettings(guild.client, guild.id, { create: false });

            const roles = guild.roles.cache
                .filter(r => r.id !== guild.id && !r.managed)
                .sort((a, b) => b.position - a.position)
                .map(r => ({
                    id: r.id,
                    name: r.name,
                    color: r.color,
                    hoist: r.hoist,
                    permissions: r.permissions.bitfield.toString(),
                    mentionable: r.mentionable,
                    position: r.position
                }));

            const channels = guild.channels.cache
                .filter(c => c.type !== 4) // Pas les catégories pour l'instant dans le map à plat
                .map(c => ({
                    name: c.name,
                    type: c.type,
                    parent: c.parent?.name,
                    topic: typeof c.topic === 'string' ? c.topic : undefined,
                    nsfw: typeof c.nsfw === 'boolean' ? c.nsfw : undefined,
                    rateLimitPerUser: typeof c.rateLimitPerUser === 'number' ? c.rateLimitPerUser : undefined,
                    position: c.position,
                    permissionOverwrites: c.permissionOverwrites.cache.map(o => ({
                        id: o.id,
                        type: o.type,
                        allow: o.allow.bitfield.toString(),
                        deny: o.deny.bitfield.toString()
                    }))
                }));

            const categories = guild.channels.cache
                .filter(c => c.type === 4)
                .map(c => ({
                    name: c.name,
                    position: c.position,
                    permissionOverwrites: c.permissionOverwrites.cache.map(o => ({
                        id: o.id,
                        type: o.type,
                        allow: o.allow.bitfield.toString(),
                        deny: o.deny.bitfield.toString()
                    }))
                }));

            const backupId = Helpers.generateId(12);
            
            const backupData = {
                name: guild.name,
                icon: guild.iconURL(),
                roles,
                channels,
                categories,
                emojis: guild.emojis.cache.map(e => ({ name: e.name, url: e.url })),
                // Sauvegarder la configuration complète du serveur
                configuration: settings ? {
                    prefix: settings.prefix,
                    language: settings.language,
                    logs: settings.logs,
                    moderation: settings.moderation,
                    antiraid: settings.antiraid,
                    automod: settings.automod,
                    tickets: settings.tickets,
                    tempvoc: settings.tempvoc,
                    giveaway: settings.giveaway,
                    welcome: settings.welcome,
                    boost: settings.boost,
                    owners: settings.owners,
                    modRoles: settings.modRoles,
                    adminRoles: settings.adminRoles,
                } : null
            };

            const backup = await Backup.create({
                guildId: guild.id,
                createdBy: userId,
                backupId,
                data: backupData,
                size: JSON.stringify(backupData).length
            });

            return backup;
        } catch (error) {
            Logger.error('Erreur lors de la création du backup:', error);
            throw error;
        }
    },

    /**
     * Remappe l'id d'un override de permissions sauvegardé vers sa cible réelle.
     * - type 0 (rôle) : on remplace par le nouvel id du rôle recréé (via roleMap),
     *   le @everyone étant remplacé par l'id du guild.
     * - type 1 (utilisateur) : on conserve l'id tel quel.
     * Fonction pure → testable.
     */
    rewriteOverwrite(overwrite, roleMap, everyoneRoleId) {
        if (!overwrite || typeof overwrite !== 'object') return null;
        if (!overwrite.id || (overwrite.type !== 0 && overwrite.type !== 1)) return null;
        const originalId = String(overwrite.id);
        let newId = originalId;

        if (overwrite.type === 0) {
            newId = originalId === everyoneRoleId
                ? everyoneRoleId
                : (roleMap.get(originalId) || null);
            if (!newId) return null; // rôle non mappé → on ignore cet override
        }
        // type 1 (membre) : id conservé tel quel.

        return {
            id: newId,
            type: overwrite.type,
            allow: overwrite.allow,
            deny: overwrite.deny,
        };
    },

    /**
     * Restaurer un backup (structure + configuration)
     */
    async restore(guild, backupId) {
        const backup = await Backup.findOne({ backupId });
        if (!backup) return null;

        const data = backup.data;
        const report = { restored: 0, failed: 0, duplicates: 0, roles: [], channels: [] };

        try {
            // Restaurer la configuration du serveur
            if (data.configuration) {
                await Guild.updateOne({ guildId: guild.id }, data.configuration);
                invalidateGuildSettings(guild.client, guild.id);
                Logger.info(`Configuration restaurée pour le serveur ${guild.name}`);
            }

            // 1) Créer (ou réutiliser) les rôles, en mappant ancien id → nouvel id.
            const roleMap = new Map(); // oldId → newRoleId
            const rolesData = Array.isArray(data.roles) ? data.roles : [];
            for (const rData of rolesData) {
                try {
                    const existing = guild.roles.cache.find(r => r.name === rData.name && !r.managed);
                    if (existing) {
                        roleMap.set(rData.id, existing.id);
                        report.duplicates++;
                        report.roles.push({ name: rData.name, status: 'duplicate' });
                        continue;
                    }
                    const role = await guild.roles.create({
                        name: rData.name,
                        color: rData.color,
                        hoist: rData.hoist,
                        permissions: BigInt(rData.permissions),
                        mentionable: rData.mentionable,
                        reason: 'Restauration Backup',
                    });
                    roleMap.set(rData.id, role.id);
                    report.restored++;
                    report.roles.push({ name: rData.name, status: 'created' });
                } catch {
                    report.failed++;
                    report.roles.push({ name: rData.name, status: 'failed' });
                }
            }

            // 2) Créer (ou réutiliser) les catégories.
            const categoryMap = new Map(); // oldName → newChannelId
            const categoriesData = Array.isArray(data.categories) ? data.categories : [];
            for (const catData of categoriesData) {
                try {
                    const existing = guild.channels.cache.find(c => c.name === catData.name && c.type === 4);
                    if (existing) {
                        categoryMap.set(catData.name, existing.id);
                        report.duplicates++;
                        continue;
                    }
                    const cat = await guild.channels.create({
                        name: catData.name,
                        type: 4,
                        position: catData.position,
                        reason: 'Restauration Backup',
                    });
                    categoryMap.set(catData.name, cat.id);
                    report.restored++;
                } catch {
                    report.failed++;
                }
            }

            // 3) Créer les salons puis réappliquer leurs permissionOverwrites.
            const channelsData = Array.isArray(data.channels) ? data.channels : [];
            for (const chData of channelsData) {
                let channel;
                try {
                    const existing = guild.channels.cache.find(c => c.name === chData.name && c.type === chData.type);
                    if (existing) {
                        channel = existing;
                        report.duplicates++;
                        report.channels.push({ name: chData.name, status: 'duplicate' });
                    } else {
                        const options = {
                            name: chData.name,
                            type: chData.type,
                            parent: chData.parent ? categoryMap.get(chData.parent) : null,
                            position: chData.position,
                            reason: 'Restauration Backup',
                        };
                        if (chData.type === 0) {
                            if (typeof chData.topic === 'string') options.topic = chData.topic;
                            if (typeof chData.nsfw === 'boolean') options.nsfw = chData.nsfw;
                            if (typeof chData.rateLimitPerUser === 'number') options.rateLimitPerUser = chData.rateLimitPerUser;
                        }
                        channel = await guild.channels.create(options);
                        report.restored++;
                        report.channels.push({ name: chData.name, status: 'created' });
                    }

                    // 4) Réappliquer les permissionOverwrites en remappant les ids de rôles.
                    const overwrites = Array.isArray(chData.permissionOverwrites) ? chData.permissionOverwrites : [];
                    const rewritten = overwrites
                        .map(ov => this.rewriteOverwrite(ov, roleMap, guild.id))
                        .filter(Boolean);
                    if (rewritten.length > 0 && channel?.permissionOverwrites?.set) {
                        await channel.permissionOverwrites.set(rewritten).catch(() => {});
                    }
                } catch {
                    report.failed++;
                    if (!report.channels.some(rc => rc.name === chData.name)) {
                        report.channels.push({ name: chData.name, status: 'failed' });
                    }
                }
            }

            return report;
        } catch (error) {
            Logger.error('Erreur lors de la restauration du backup:', error);
            throw error;
        }
    }
};

module.exports = BackupService;
