'use strict';

const { PermissionFlagsBits } = require('discord.js');
const AntiraidService = require('./antiraidService');
const EmbedHelper = require('../utils/embedBuilder');
const Logger = require('../utils/logger');

const PUNISHMENTS = ['softban', 'ban', 'kick', 'timeout'];
const TIMEOUT_MS = 24 * 60 * 60 * 1000;
const DELETE_SECONDS = 24 * 60 * 60;
const REASON = '[HONEYPOT] Message dans le salon piège';

// Un spammeur poste souvent plusieurs messages d'affilée : une seule sanction.
const inFlight = new Set();

function isStaff(member) {
    return member?.permissions?.has(PermissionFlagsBits.ManageMessages) === true;
}

async function applyPunishment(guild, member, punishment) {
    switch (punishment) {
        case 'ban':
            if (!member.bannable) return false;
            await guild.members.ban(member.id, { deleteMessageSeconds: DELETE_SECONDS, reason: REASON });
            return true;
        case 'kick':
            if (!member.kickable) return false;
            await member.kick(REASON);
            return true;
        case 'timeout':
            if (!member.moderatable) return false;
            await member.timeout(TIMEOUT_MS, REASON);
            return true;
        default:
            // Softban : ban + unban immédiat pour effacer 24 h de messages sans bannir.
            if (!member.bannable) return false;
            await guild.members.ban(member.id, { deleteMessageSeconds: DELETE_SECONDS, reason: REASON });
            await guild.members.unban(member.id, '[HONEYPOT] Fin du softban');
            return true;
    }
}

module.exports = {
    PUNISHMENTS,

    isHoneypot(message, settings) {
        const honeypot = settings?.honeypot;
        return Boolean(honeypot?.enabled && honeypot.channelId && message.channelId === honeypot.channelId);
    },

    /**
     * Sanctionne l'auteur d'un message posté dans le salon piège.
     * Retourne true si le message a été traité (le reste du pipeline doit s'arrêter).
     */
    async handle(client, message, settings) {
        const guild = message.guild;
        const member = message.member || await guild.members.fetch(message.author.id).catch(() => null);

        const trust = isStaff(member)
            ? 'staff'
            : await AntiraidService.getTrustReason(client, guild, settings, message.author.id, member);
        if (trust) return false;

        await message.delete().catch(() => {});

        const key = `${guild.id}:${message.author.id}`;
        if (inFlight.has(key) || !member) return true;
        inFlight.add(key);

        const punishment = PUNISHMENTS.includes(settings.honeypot.punishment) ? settings.honeypot.punishment : 'softban';
        try {
            await message.author.send({
                embeds: [EmbedHelper.warning(`Tu as écrit dans le salon piège de **${guild.name}** et tu as été sanctionné automatiquement (${punishment}).\n\nSi ce n'était pas toi, ton compte est peut-être piraté : change ton mot de passe et active l'authentification à deux facteurs.`)],
            }).catch(() => {});

            const done = await applyPunishment(guild, member, punishment);
            await AntiraidService.logDecision(client, guild, settings, {
                level: done ? 'action' : 'failed',
                moduleKey: 'honeypot',
                group: 'honeypot',
                executorId: message.author.id,
                action: 'message',
                reason: done ? 'message dans le salon piège' : 'sanction impossible (rôle trop haut ?)',
                punishment: done ? punishment : 'aucune',
            });
        } catch (error) {
            Logger.error('[Honeypot]', error.message);
        } finally {
            setTimeout(() => inFlight.delete(key), 10_000).unref?.();
        }
        return true;
    },
};
