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
                    topic: c.topic,
                    nsfw: c.nsfw,
                    rateLimitPerUser: c.rateLimitPerUser,
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
     * Restaurer un backup (structure + configuration)
     */
    async restore(guild, backupId) {
        const backup = await Backup.findOne({ backupId });
        if (!backup) return null;

        const data = backup.data;

        try {
            // Restaurer la configuration du serveur
            if (data.configuration) {
                await Guild.updateOne({ guildId: guild.id }, data.configuration);
                invalidateGuildSettings(guild.client, guild.id);
                Logger.info(`Configuration restaurée pour le serveur ${guild.name}`);
            }

            for (const rData of data.roles) {
                await guild.roles.create({
                    name: rData.name,
                    color: rData.color,
                    hoist: rData.hoist,
                    permissions: BigInt(rData.permissions),
                    mentionable: rData.mentionable,
                    reason: 'Restauration Backup'
                }).catch(() => {});
            }

            const categoryMap = new Map();
            for (const catData of data.categories) {
                const cat = await guild.channels.create({
                    name: catData.name,
                    type: 4,
                    position: catData.position,
                    reason: 'Restauration Backup'
                }).catch(() => null);
                if (cat) categoryMap.set(catData.name, cat.id);
            }

            for (const chData of data.channels) {
                await guild.channels.create({
                    name: chData.name,
                    type: chData.type,
                    parent: chData.parent ? categoryMap.get(chData.parent) : null,
                    topic: chData.topic,
                    nsfw: chData.nsfw,
                    rateLimitPerUser: chData.rateLimitPerUser,
                    position: chData.position,
                    reason: 'Restauration Backup'
                }).catch(() => {});
            }

            return true;
        } catch (error) {
            Logger.error('Erreur lors de la restauration du backup:', error);
            throw error;
        }
    }
};

module.exports = BackupService;
