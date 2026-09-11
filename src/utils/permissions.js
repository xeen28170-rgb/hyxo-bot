'use strict';

const { getGuildSettings } = require('./guildSettings');

const PermissionLevel = {
    PUBLIC: 0,
    MOD: 1,
    ADMIN: 2,
    MANAGER: 3,
    SERVER_OWNER: 4,
    BOT_OWNER: 5,
};

// Le "propriétaire" absolu du bot (celui qui peut unblacklist, etc.).
// Priorité : BOT_PROPRIETAIRE_ID, sinon le premier ID de OWNER_IDS.
const PROPRIETAIRE_ID = (
    process.env.BOT_PROPRIETAIRE_ID
    || (process.env.OWNER_IDS || '').split(',')[0]
    || ''
).trim();

// Chargement dynamique des IDs créateurs depuis .env (CREATOR_IDS=id1,id2,...)
const CREATOR_IDS = new Set(
    (process.env.CREATOR_IDS || process.env.OWNER_IDS || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
);

const PermissionsHelper = {
    /**
     * Vérifier si un utilisateur est propriétaire du bot (ou créateur)
     */
    isBotOwner(client, userId) {
        return CREATOR_IDS.has(userId) || client.owners?.has(userId) || client.botOwners?.has(userId);
    },

    /**
     * Vérifier si un utilisateur est le créateur absolu
     */
    isCreator(userId) {
        return CREATOR_IDS.has(userId);
    },

    /**
     * Vérifier si un utilisateur est le propriétaire absolu du bot
     * (le seul qui peut retirer de la blacklist, etc.)
     */
    isProprietaire(userId) {
        return Boolean(userId && PROPRIETAIRE_ID && String(userId) === PROPRIETAIRE_ID);
    },

    /**
     * Vérifier si un utilisateur est propriétaire du serveur (la couronne)
     */
    isGuildOwner(member) {
        return member.guild.ownerId === member.id;
    },

    /**
     * Vérifier si un utilisateur est dans la liste des owners du serveur
     */
    async isServerOwner(member, guildSettings) {
        if (!guildSettings) {
            guildSettings = await getGuildSettings(member.client || member.guild.client, member.guild.id, { create: false });
        }
        if (this.isCreator(member.id)) return true;
        if (this.isGuildOwner(member)) return true;
        if (guildSettings?.owners?.includes(member.id)) return true;
        if (Array.isArray(guildSettings?.ownerRoles) && guildSettings.ownerRoles.some(roleId => member.roles.cache.has(roleId))) return true;
        return false;
    },

    /**
     * Vérifier si l'utilisateur est modérateur (a un rôle modérateur)
     */
    async isMod(member, guildSettings) {
        if (!guildSettings) {
            guildSettings = await getGuildSettings(member.client || member.guild.client, member.guild.id, { create: false });
        }
        if (!guildSettings) return false;
        const modRoles = guildSettings.modRoles || [];
        return member.roles.cache.some(r => modRoles.includes(r.id))
            || member.permissions.has('KickMembers');
    },

    /**
     * Vérifier si l'utilisateur est admin
     */
    async isAdmin(member, guildSettings) {
        if (!guildSettings) {
            guildSettings = await getGuildSettings(member.client || member.guild.client, member.guild.id, { create: false });
        }
        if (!guildSettings) return false;
        const adminRoles = guildSettings.adminRoles || [];
        return member.roles.cache.some(r => adminRoles.includes(r.id))
            || member.permissions.has('Administrator');
    },

    /**
     * Obtenir le niveau de permission d'un membre
     */
    async getLevel(client, member, guildSettings) {
        if (this.isBotOwner(client, member.id)) return PermissionLevel.BOT_OWNER;
        if (this.isGuildOwner(member)) return PermissionLevel.SERVER_OWNER;
        if (await this.isServerOwner(member, guildSettings)) return PermissionLevel.MANAGER;
        if (await this.isAdmin(member, guildSettings)) return PermissionLevel.ADMIN;
        if (await this.isMod(member, guildSettings)) return PermissionLevel.MOD;
        return PermissionLevel.PUBLIC;
    },

    /**
     * Vérifier les permissions d'une commande
     */
    async checkCommand(client, message, command) {
        const member = message.member;

        if (command.ownerOnly && !this.isBotOwner(client, message.author.id)) {
            return { allowed: false, reason: 'owner_only' };
        }

        if (command.permissions?.length) {
            const missing = command.permissions.filter(perm => !member.permissions.has(perm));
            if (missing.length) {
                return { allowed: false, reason: 'no_permission', missing };
            }
        }

        if (command.botPermissions?.length) {
            const botMember = message.guild.members.me;
            const missing = command.botPermissions.filter(perm => !botMember.permissions.has(perm));
            if (missing.length) {
                return { allowed: false, reason: 'bot_no_permission', missing };
            }
        }

        return { allowed: true };
    },

    /**
     * Vérifier si un membre peut cibler un autre membre (hiérarchie)
     */
    canTarget(executor, target) {
        if (!target.guild) return true;
        if (target.guild.ownerId === target.id) return false;
        if (target.guild.ownerId === executor.id) return true;
        return executor.roles.highest.position > target.roles.highest.position;
    },

    /**
     * Vérifier si le bot peut cibler un membre
     */
    botCanTarget(guild, target) {
        if (target.guild.ownerId === target.id) return false;
        const botMember = guild.members.me;
        return botMember.roles.highest.position > target.roles.highest.position;
    },

    canManageRole(member, role) {
        if (!member || !role || role.managed || role.id === member.guild.id) return false;
        if (member.guild.ownerId === member.id) return true;
        return role.position < member.roles.highest.position;
    },

    botCanManageRole(guild, role) {
        const botMember = guild.members.me;
        return Boolean(botMember && role && !role.managed && role.position < botMember.roles.highest.position);
    },

    isSafeSelfAssignableRole(role) {
        if (!role || role.managed) return false;
        const dangerous = [
            'Administrator',
            'ManageGuild',
            'ManageRoles',
            'ManageChannels',
            'ManageWebhooks',
            'BanMembers',
            'KickMembers',
            'ModerateMembers',
            'MentionEveryone',
        ];
        return !dangerous.some(permission => role.permissions.has(permission));
    },
};

PermissionsHelper.Level = PermissionLevel;

module.exports = PermissionsHelper;
