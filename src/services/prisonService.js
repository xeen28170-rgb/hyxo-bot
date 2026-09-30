'use strict';

const { ChannelType } = require('discord.js');
const Guild = require('../models/Guild');
const Logger = require('../utils/logger');
const { getGuildSettings, invalidateGuildSettings } = require('../utils/guildSettings');
const LogDispatcher = require('../utils/logDispatcher');
const EmbedHelper = require('../utils/embedBuilder');
const PrisonPermissions = require('./prisonPermissions');
const { withKey } = require('../utils/keyedQueue');
const { mapLimit } = require('../utils/concurrency');

/**
 * Service du système de prison (rôle Alcatraz / Klebs).
 *
 * Principe : le rôle Alcatraz reçoit un deny explicite ViewChannel/Connect sur
 * TOUS les salons et catégories du serveur, SAUF sur la catégorie prison et ses
 * salons (cellule + alcatraz). Le prisonnier ne voit donc QUE la catégorie
 * prison. Des overwrites individuels completent le role pour primer sur les
 * autorisations des autres roles; ils sont restaures lors de la liberation.
 *
 * Le rôle n'est attribué QUE via les commandes de prison (-prison / -unprison /
 * -unprisonall). Il n'est plus couplé au mute, au kick, au ban ni aux timeouts.
 * La liste des prisonniers est persistée dans settings.prison.prisoners.
 *
 * Exception: un membre avec la permission Administrator ignore tous les
 * overwrites de salon côté Discord — c'est une limitation native de Discord,
 * pas de ce système.
 */
const PrisonService = {
    releasing: new Set(),

    async restorePrisonRole(client, member) {
        const key = `${member.guild.id}:${member.id}`;
        if (this.releasing.has(key)) return;
        const settings = await getGuildSettings(client, member.guild.id, { create: false, useCache: false });
        if (!settings?.prison?.prisoners?.includes(String(member.id))) return;
        const roleId = settings.prison.roleId;
        if (!roleId || this.releasing.has(key)) return;
        if (!member.roles.cache.has(roleId)) await member.roles.add(roleId, 'Prison: restauration du role retire manuellement');
        await PrisonPermissions.apply(client, member.guild, member.id);
    },
    getExceptionSets(prisonSettings = {}) {
        // Visibilité STRICTE : le prisonnier ne voit QUE la catégorie prison
        // (cellule + alcatraz). Tout le reste est bloqué par un deny ViewChannel,
        // y compris les salons de support et les salons publics, malgré les autres
        // roles du membre grace aux overwrites individuels complementaires.
        const categoryIds = new Set([prisonSettings.categoryId].filter(Boolean));
        const channelIds = new Set([prisonSettings.jailChannelId, prisonSettings.voiceChannelId].filter(Boolean));
        return { categoryIds, channelIds };
    },

    isExempt(channel, prisonSettings) {
        const { categoryIds, channelIds } = this.getExceptionSets(prisonSettings);
        if (channelIds.has(channel.id)) return true;
        if (channel.type === ChannelType.GuildCategory && categoryIds.has(channel.id)) return true;
        if (channel.parentId && categoryIds.has(channel.parentId)) return true;
        return false;
    },

    /**
     * Calcule et applique l'overwrite correct pour UN salon (utilisé à la fois
     * pour le setup initial, la reconfig du support, et à la création de tout
     * nouveau salon sur le serveur).
     */
    async applyChannelOverwrite(channel, role, prisonSettings) {
        if (channel.isThread?.() || !channel.permissionOverwrites) return;
        const isVoice = channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
        const isCategory = channel.type === ChannelType.GuildCategory;
        const exempt = this.isExempt(channel, prisonSettings);

        let overwrite;
        if (exempt) {
            overwrite = { ViewChannel: true };
            if (isVoice) { overwrite.Connect = true; overwrite.Speak = true; }
            else if (!isCategory) {
                // Salon texte de la prison (cellule / support) : on laisse les détenus
                // écrire, envoyer des images et des « gifts » (liens intégrés, gifs,
                // emojis et stickers externes) dans leur cellule.
                overwrite.SendMessages = true;
                overwrite.ReadMessageHistory = true;
                overwrite.AttachFiles = true;
                overwrite.EmbedLinks = true;
                overwrite.UseExternalEmojis = true;
                overwrite.UseExternalStickers = true;
                overwrite.AddReactions = true;
                overwrite.SendMessagesInThreads = true;
            }
        } else {
            overwrite = { ViewChannel: false };
            if (isVoice) { overwrite.Connect = false; overwrite.Speak = false; }
        }

        await channel.permissionOverwrites.edit(role, overwrite);
    },

    /**
     * Reparcourt tout le serveur pour (ré)appliquer les overwrites du rôle Alcatraz.
     * À appeler après le setup initial et après chaque changement de config (support).
     */
    async applyDenyOverwrites(guild, role, prisonSettings) {
        let updated = 0, failed = 0;
        const channels = [...guild.channels.cache.values()].filter(channel => {
            if (typeof channel.isThread === 'function' && channel.isThread()) return false;
            return Boolean(channel.permissionOverwrites);
        });
        // En parallèle (limite 5) : sur un gros serveur, appliquer l'overwrite salon
        // par salon en séquentiel pouvait faire durer le setup/la reconfig plusieurs
        // dizaines de secondes.
        await mapLimit(channels, async (channel) => {
            try {
                await this.applyChannelOverwrite(channel, role, prisonSettings);
                updated++;
            } catch (err) {
                failed++;
                Logger.error(`[Prison] Overwrite échoué sur #${channel.name} (${channel.id}) [${channel.type}]:`, err.message || err.code || String(err));
            }
        }, 5);
        return { updated, failed };
    },

    /**
     * Place un membre en prison (ajout du rôle Alcatraz + enregistrement dans la
     * liste persistante des prisonniers). Anti-doublon : si la personne est déjà
     * en prison, ne refait rien.
     */
    async imprison(client, guild, member, { reason } = {}) {
        const settings = await getGuildSettings(client, guild.id, { create: false });
        const prison = settings?.prison;
        if (!prison?.enabled || !prison?.roleId) return { ok: false, code: 'not_configured' };
        if (!member) return { ok: false, code: 'member_missing' };
        if (member.id === guild.ownerId || member.permissions?.has('Administrator')) return { ok: false, code: 'administrator' };

        const role = guild.roles.cache.get(prison.roleId);
        if (!role) return { ok: false, code: 'role_missing' };

        const alreadyListed = await PrisonStore.isPrisoner(client, guild.id, member.id);
        const alreadyRoled = member.roles.cache.has(role.id);

        if (alreadyListed) {
            await this.restorePrisonRoleUnlocked(client, member);
            return { ok: false, code: 'already_prisoner' };
        }

        // Rôle présent sans être listé (cas legacy/après migration) : on répare la liste
        // sans retirer/rajouter le rôle, et on considère la personne déjà en prison.
        if (alreadyRoled) {
            await PrisonStore.addPrisoner(client, guild.id, member.id);
            await PrisonPermissions.apply(client, guild, member.id);
            return { ok: false, code: 'already_prisoner' };
        }

        await member.roles.add(role, reason || 'Placement en prison').catch(err => {
            Logger.error('[Prison] Impossible d\'assigner le rôle Alcatraz:', err.message);
            throw err;
        });

        // Enregistre le prisonnier (persistant, repris au redémarrage).
        await PrisonStore.addPrisoner(client, guild.id, member.id);
        await PrisonPermissions.apply(client, guild, member.id);

        // Log de placement en prison.
        try {
            const embed = EmbedHelper.info('🚧 Placement en prison', [
                `**Membre:** ${member.user} (\`${member.id}\`)`,
                `**Rôle:** \`${role.name}\``,
                reason ? `**Raison:** ${reason}` : '',
            ].filter(Boolean).join('\n'), { color: 0xFF0000 })
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            await LogDispatcher.prison(guild, embed);
        } catch { /* silence */ }

        // MP configuré à l'entrée en prison.
        await sendNotifyDM(guild, member, 'message');

        return { ok: true, code: 'done' };
    },

    /**
     * Libère un membre de prison (retrait du rôle + retrait de la liste).
     * Retourne false si la personne n'était pas en prison.
     */
    async release(client, guild, member, reason) {
        const settings = await getGuildSettings(client, guild.id, { create: false });
        const roleId = settings?.prison?.roleId;
        if (!roleId) return { ok: false, code: 'not_configured' };
        if (!member) return { ok: false, code: 'member_missing' };

        const wasRole = member.roles.cache.has(roleId);
        const wasListed = await PrisonStore.isPrisoner(client, guild.id, member.id);

        if (!wasRole && !wasListed) return { ok: false, code: 'not_prisoner' };

        const releaseKey = `${guild.id}:${member.id}`;
        this.releasing.add(releaseKey);
        try {
            await PrisonPermissions.restore(client, guild, member.id);
            if (wasRole) {
                await member.roles.remove(roleId, reason || 'Retrait de prison').catch(err => {
                    Logger.error('[Prison] Impossible de retirer le rôle Alcatraz:', err.message);
                    throw err;
                });
            }
            await PrisonStore.removePrisoner(client, guild.id, member.id);
            await Guild.updateOne({ guildId: guild.id }, { $set: { [`prison.memberOverwrites.${member.id}`]: {} } });
            invalidateGuildSettings(client, guild.id);
        } finally {
            this.releasing.delete(releaseKey);
        }

        // Log de libération de prison.
        try {
            const embed = EmbedHelper.info('🚧 Libération de prison', [
                `**Membre:** ${member.user} (\`${member.id}\`)`,
                reason ? `**Raison:** ${reason}` : '',
            ].filter(Boolean).join('\n'), { color: 0x00FF00 })
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            await LogDispatcher.prison(guild, embed);
        } catch { /* silence */ }

        // MP configuré à la libération de prison.
        await sendNotifyDM(guild, member, 'releaseMessage');

        return { ok: true, code: 'done' };
    },

    /**
     * Libère tous les prisonniers (pour -unprisonall). Gère les membres partis
     * du serveur : une erreur sur l'un n'empêche pas la libération des autres.
     * Retourne un compte-rendu { released, failed } et vide la liste persistée.
     */
    async releaseAll(client, guild, reason) {
        const settings = await getGuildSettings(client, guild.id, { create: false });
        const prison = settings?.prison;
        const roleId = prison?.roleId;
        const prisoners = Array.isArray(prison?.prisoners) ? prison.prisoners : [];

        let released = 0;
        let failed = 0;

        // Libère d'abord ceux qui sont encore sur le serveur. Limite basse (3) car
        // chaque release() parallélise déjà ses propres appels par salon.
        await mapLimit(prisoners, async (userId) => {
            try {
                let member = guild.members.cache.get(userId);
                if (!member) {
                    try { member = await guild.members.fetch(userId); } catch (error) {
                        if (error.code !== 10007) throw error;
                        member = null;
                    }
                }
                if (member && roleId) {
                    const result = await this.release(client, guild, member, reason);
                    if (!result.ok && result.code !== 'not_prisoner') throw new Error(result.code);
                } else {
                    await PrisonStore.removePrisoner(client, guild.id, userId);
                }
                released++;
            } catch (err) {
                failed++;
                Logger.error(`[Prison] Libération échouée pour ${userId}:`, err.message);
            }
        }, 3);

        // Vide la liste persistée (y compris les membres partis).

        // Log synthétique.
        try {
            const embed = EmbedHelper.info('🚧 Libération de tous les prisonniers', [
                `**Membres libérés:** ${released}`,
                failed ? `**Échecs:** ${failed}` : '',
                reason ? `**Raison:** ${reason}` : '',
            ].filter(Boolean).join('\n'), { color: 0x00FF00 })
                .setTimestamp();
            await LogDispatcher.prison(guild, embed);
        } catch { /* silence */ }

        return { released, failed };
    },

};

/**
 * Accès à la liste persistante des prisonniers (settings.prison.prisoners).
 * Stocke des user-IDs primitifs pour rester compatible avec $pull/$addToSet.
 */
const PrisonStore = {
    async _load(client, guildId) {
        const settings = await getGuildSettings(client, guildId, { create: false });
        return Array.isArray(settings?.prison?.prisoners) ? settings.prison.prisoners : [];
    },
    async isPrisoner(client, guildId, userId) {
        const list = await this._load(client, guildId);
        return list.includes(String(userId));
    },
    async getPrisoners(client, guildId) {
        return this._load(client, guildId);
    },
    async addPrisoner(client, guildId, userId) {
        await Guild.updateOne(
            { guildId },
            { $addToSet: { 'prison.prisoners': String(userId) } },
        );
        invalidateGuildSettings(client, guildId);
    },
    async removePrisoner(client, guildId, userId) {
        await Guild.updateOne(
            { guildId },
            { $pull: { 'prison.prisoners': String(userId) } },
        );
        invalidateGuildSettings(client, guildId);
    },
    async clearPrisoners(client, guildId) {
        await Guild.updateOne({ guildId }, { 'prison.prisoners': [] });
        invalidateGuildSettings(client, guildId);
    },
};

async function sendNotifyDM(guild, member, field, duration) {
    try {
        const settings = await getGuildSettings(guild.client, guild.id, { create: false });
        const prison = settings?.prison;
        const notify = prison?.notifyDM;
        if (!notify?.enabled) return;

        let template = field === 'releaseMessage' ? notify.releaseMessage : notify.message;
        if (!template) return;

        template = template
            .replace(/\{serveur\}/gi, guild.name)
            .replace(/\{membre\}/gi, member.user?.tag || member.user?.username || 'membre')
            .replace(/\{user\}/gi, `<@${member.id}>`)
            .replace(/\{ping\}/gi, `<@${member.id}>`)
            .replace(/\{duree\}/gi, duration ? formatDurationLabel(duration) : 'indéterminée');

        const dm = await member.user.createDM().catch(() => null);
        if (!dm) return;
        await dm.send({
            content: template,
            // Autorise la mention du membre pour que `{user}` / `{ping}` notifie réellement.
            allowedMentions: { parse: ['users'], repliedUser: false },
        }).catch(() => {});
    } catch { /* silence */ }
}

function formatDurationLabel(ms) {
    if (!ms || ms <= 0) return 'indéterminée';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}j ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}min`;
}

// Serialiser reparation et liberation pour ne pas reemprisonner un membre libere.
for (const name of ['restorePrisonRole', 'imprison', 'release']) {
    const action = PrisonService[name];
    PrisonService[`${name}Unlocked`] = action;
    PrisonService[name] = function (client, guildOrMember, ...args) {
        const member = name === 'restorePrisonRole' ? guildOrMember : args[0];
        if (!member) return action.call(this, client, guildOrMember, ...args);
        if (name === 'restorePrisonRole' && this.releasing.has(`${member.guild.id}:${member.id}`)) return Promise.resolve();
        return withKey(`prison:${member.guild.id}:${member.id}`, () => action.call(this, client, guildOrMember, ...args));
    };
}

PrisonService.enforceChannel = async function (client, channel) {
    const settings = await getGuildSettings(client, channel.guild.id, { create: false });
    for (const userId of settings?.prison?.prisoners || []) {
        await withKey(`prison:${channel.guild.id}:${userId}`, () => PrisonPermissions.apply(client, channel.guild, userId, channel));
    }
};

module.exports = PrisonService;
