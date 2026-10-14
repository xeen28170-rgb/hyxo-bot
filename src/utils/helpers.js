'use strict';

const { ChannelType } = require('discord.js');
const ms = require('ms');
const moment = require('moment');

const Helpers = {
    resolveUserId(input) {
        if (typeof input !== 'string') return null;
        const match = input.trim().match(/^(?:<@!?(\d{17,20})>|(\d{17,20}))$/);
        return match ? (match[1] || match[2]) : null;
    },
    /**
     * Parser une durée en ms (ex: "10m" → 600000)
     */
    parseDuration(input) {
        if (!input) return null;
        const duration = ms(input);
        return isNaN(duration) || duration <= 0 ? null : duration;
    },

    /**
     * Formater une durée en texte lisible
     */
    formatDuration(ms_value) {
        if (!ms_value) return 'Permanente';
        const seconds = Math.floor(ms_value / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}j ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    },

    /**
     * Formater une date
     */
    formatDate(date) {
        return moment(date).format('DD/MM/YYYY HH:mm:ss');
    },

    /**
     * Timestamp Discord
     */
    discordTimestamp(date, format = 'R') {
        return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${format}>`;
    },

    /**
     * Résoudre un utilisateur depuis un message
     */
    async resolveUser(client, input, guild) {
        if (!input || typeof input !== 'string') return null;
        const id = Helpers.resolveUserId(input);
        if (!id) return null;

        try {
            if (guild) {
                const member = guild.members.cache.get(id)
                    || await guild.members.fetch(id).catch(() => null);
                if (member) return member;
            }
            return await client.users.fetch(id).catch(() => null);
        } catch {
            return null;
        }
    },

    /**
     * Résoudre un membre depuis un message
     */
    async resolveMember(guild, input) {
        if (!input || typeof input !== 'string') return null;
        const id = Helpers.resolveUserId(input);

        if (id) {
            return guild.members.cache.get(id)
                || await guild.members.fetch(id).catch(() => null);
        }

        const name = input.toLowerCase();
        return guild.members.cache.find(m => {
            const username = m.user?.username?.toLowerCase() || '';
            const displayName = m.displayName?.toLowerCase() || '';
            const tag = m.user?.tag?.toLowerCase() || '';
            return username === name || displayName === name || tag === name;
        }) || null;
    },

    /**
     * Résoudre un rôle
     */
    resolveRole(guild, input) {
        if (!input || typeof input !== 'string') return null;
        const mentionMatch = input.match(/^<@&(\d+)>$/);
        const id = mentionMatch ? mentionMatch[1] : input;

        if (/^\d+$/.test(id)) return guild.roles.cache.get(id) || null;
        return guild.roles.cache.find(r => (r.name || '').toLowerCase() === input.toLowerCase()) || null;
    },

    /**
     * Membre + rôle dans n'importe quel ordre (« @membre @rôle », « @rôle @membre »,
     * IDs, nom du rôle). En réponse au message de quelqu'un, le membre est l'auteur
     * de ce message et les arguments ne servent qu'à trouver le rôle.
     * @returns {Promise<{ member: import('discord.js').GuildMember|null, role: import('discord.js').Role|null }>}
     */
    async resolveMemberAndRole(message, args) {
        const guild = message.guild;
        let member = null;
        let role = null;
        if (message.reference?.messageId) {
            const replied = await message.fetchReference().catch(() => null);
            if (replied?.author) member = await guild.members.fetch(replied.author.id).catch(() => null);
        }
        const rest = [];
        for (const token of args) {
            const roleMention = /^<@&(\d{17,20})>$/.exec(token);
            const userMention = /^<@!?(\d{17,20})>$/.exec(token);
            if (roleMention && !role) { role = guild.roles.cache.get(roleMention[1]) || null; continue; }
            if (userMention && !member) { member = await guild.members.fetch(userMention[1]).catch(() => null); continue; }
            if (/^\d{17,20}$/.test(token)) {
                // ID seul : un rôle du serveur, sinon un membre.
                if (!role && guild.roles.cache.has(token)) { role = guild.roles.cache.get(token); continue; }
                if (!member) { member = await guild.members.fetch(token).catch(() => null); if (member) continue; }
            }
            rest.push(token);
        }
        // Le reste du texte : nom du rôle (ou du membre). Avec les deux manquants, on essaie
        // chaque découpage « membre puis rôle » et « rôle puis membre ».
        const findRole = text => Helpers.resolveRole(guild, text)
            || guild.roles.cache.find(r => r.name.toLowerCase().includes(text.toLowerCase()) && text.length >= 3) || null;
        if (rest.length && !role && member) role = findRole(rest.join(' '));
        else if (rest.length && role && !member) member = await Helpers.resolveMember(guild, rest.join(' '));
        else if (rest.length && !role && !member) {
            for (let i = 1; i < rest.length && !(role && member); i++) {
                const left = rest.slice(0, i).join(' '), right = rest.slice(i).join(' ');
                const m1 = await Helpers.resolveMember(guild, left), r1 = m1 && findRole(right);
                if (m1 && r1) { member = m1; role = r1; break; }
                const r2 = findRole(left), m2 = r2 && await Helpers.resolveMember(guild, right);
                if (r2 && m2) { member = m2; role = r2; break; }
            }
        }
        return { member, role };
    },

    /**
     * Résoudre un salon
     */
    resolveChannel(guild, input) {
        if (!input || typeof input !== 'string') return null;
        const mentionMatch = input.match(/^<#(\d+)>$/);
        const id = mentionMatch ? mentionMatch[1] : input;

        if (/^\d+$/.test(id)) return guild.channels.cache.get(id) || null;
        return guild.channels.cache.find(c => (c.name || '').toLowerCase() === input.toLowerCase()) || null;
    },

    /**
     * Résoudre une catégorie
     */
    resolveCategory(guild, input) {
        const channel = this.resolveChannel(guild, input);
        return channel?.type === ChannelType.GuildCategory ? channel : null;
    },

    /**
     * Tronquer un texte
     */
    truncate(text, max = 1024) {
        if (!text) return '';
        return text.length > max ? text.slice(0, max - 3) + '...' : text;
    },

    /**
     * Capitaliser une chaîne
     */
    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    },

    /**
     * Vérifier si un membre peut être ciblé par une commande de modération
     */
    async checkTarget(message, target, checkHierarchy = true) {
        if (!target) return { allowed: false, reason: message.t('general.invalid_user') };
        if (target.id === message.author.id) return { allowed: false, reason: 'Vous ne pouvez pas vous cibler vous-même.' };
        if (target.user?.bot) return { allowed: false, reason: message.t('general.cannot_target_bot') };
        
        if (checkHierarchy) {
            const PermissionsHelper = require('./permissions');
            if (!PermissionsHelper.canTarget(message.member, target)) {
                return { allowed: false, reason: message.t('general.higher_role') };
            }
        }
        
        return { allowed: true };
    },

    /**
     * Attendre N millisecondes
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Diviser un tableau en chunks
     */
    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    },

    /**
     * Générer un ID unique court
     */
    generateId(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    },

    /**
     * Vérifier si une chaîne est un ID Discord valide
     */
    isValidId(id) {
        return /^\d{17,20}$/.test(id);
    },

    /**
     * Vérifier si une URL est valide
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Obtenir le badge de permission
     */
    getPermissionBadge(level) {
        const badges = {
            0: '🌐 Public',
            1: '🛡️ Modérateur',
            2: '⚡ Administrateur',
            3: '👑 Manager',
            4: '🏆 Propriétaire',
            5: '🔑 Bot Owner',
        };
        return badges[level] || '🌐 Public';
    },
};

module.exports = Helpers;
