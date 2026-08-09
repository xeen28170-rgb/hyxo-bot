'use strict';

const Sanction = require('../models/Sanction');
const Logger = require('../utils/logger');
const EmbedHelper = require('../utils/embedBuilder');
const Helpers = require('../utils/helpers');
const LogDispatcher = require('../utils/logDispatcher');
const { getGuildSettings } = require('../utils/guildSettings');

const ModerationService = {
    /**
     * Créer une sanction et logger
     */
    async createSanction(data) {
        const { guildId, userId, moderatorId, type, reason, duration } = data;

        const caseId = await Sanction.getNextCaseId(guildId);
        const expiresAt = duration ? new Date(Date.now() + duration) : null;

        const sanction = await Sanction.create({
            guildId, userId, moderatorId, type, reason, duration,
            expiresAt, caseId,
            metadata: data.metadata || {},
        });

        return sanction;
    },

    /**
     * Logger une action de modération
     */
    async sendModLog(client, guild, sanction, target, moderator, _guildSettings) {
        if (target?.id) {
            LogDispatcher.markModerationAction(guild.id, sanction.type, target.id);
        }

        const actionEmojis = {
            warn: '⚠️', mute: '🔇', tempmute: '🔇', unmute: '🔊',
            kick: '👢', ban: '🔨', tempban: '🔨', unban: '✅',
            derank: '📉', addrole: '➕', delrole: '➖',
            lock: '🔒', unlock: '🔓', hide: '🙈', unhide: '👁️',
            clear: '🗑️', cmute: '🔇', tempcmute: '🔇', uncmute: '🔊',
        };

        const actionColors = {
            warn: 0xFEE75C, mute: 0xFF6B6B, tempmute: 0xFF6B6B,
            unmute: 0x57F287, kick: 0xFF9500, ban: 0xED4245,
            tempban: 0xED4245, unban: 0x57F287, derank: 0xFF6B6B,
            addrole: 0x57F287, delrole: 0xFF6B6B,
            lock: 0xFF6B6B, unlock: 0x57F287, hide: 0xFF6B6B, unhide: 0x57F287,
            clear: 0xFEE75C, cmute: 0xFF6B6B, uncmute: 0x57F287,
        };

        const emoji = actionEmojis[sanction.type] || '⚡';
        const color = actionColors[sanction.type] || 0x5865F2;

        const embed = EmbedHelper.moderation({
            action: `${emoji} ${sanction.type.toUpperCase()}`,
            user: target,
            moderator,
            reason: sanction.reason,
            duration: sanction.duration ? Helpers.formatDuration(sanction.duration) : null,
            caseId: sanction.caseId,
            color,
        });

        await LogDispatcher.moderationAction(guild, sanction.type, embed);
    },

    /**
     * Envoyer un DM à l'utilisateur sanctionné
     */
    async sendDM(target, type, guild, reason, moderator, duration) {
        const actionMessages = {
            warn: `⚠️ Vous avez reçu un avertissement sur **${guild.name}**.`,
            mute: `🔇 Vous avez été mis en sourdine sur **${guild.name}**.`,
            tempmute: `🔇 Vous avez été mis en sourdine sur **${guild.name}** pour **${Helpers.formatDuration(duration)}**.`,
            kick: `👢 Vous avez été expulsé de **${guild.name}**.`,
            ban: `🔨 Vous avez été banni de **${guild.name}**.`,
            tempban: `🔨 Vous avez été banni de **${guild.name}** pour **${Helpers.formatDuration(duration)}**.`,
        };

        const msg = actionMessages[type];
        if (!msg) return;

        const moderatorName = moderator.username || moderator.displayName || 'Inconnu';

        const embed = new (require('discord.js').EmbedBuilder)()
            .setColor(0xED4245)
            .setTitle(msg)
            .addFields(
                { name: '📝 Raison', value: reason || 'Aucune raison', inline: false },
                { name: '🛡️ Modérateur', value: moderatorName, inline: true },
            )
            .setTimestamp();

        await target.send({ embeds: [embed] }).catch(() => {});
    },

    /**
     * Obtenir l'historique d'un utilisateur
     */
    async getHistory(guildId, userId) {
        const all = await Sanction.find({ guildId, userId });
        return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    },

    /**
     * Traiter les sanctions expirées (appelé par cron)
     */
    async processExpired(client) {
        const expired = (await Sanction.getExpired()).slice(0, 50);

        for (const sanction of expired) {
            try {
                const guild = client.guilds.cache.get(sanction.guildId);
                if (!guild) {
                    await Sanction.updateOne({ _id: sanction._id }, { $set: { active: false } });
                    continue;
                }

                const settings = await getGuildSettings(client, sanction.guildId, { create: false });

                if (sanction.type === 'tempmute' || sanction.type === 'mute') {
                    const muteRole = settings?.moderation?.muteRole;
                    if (muteRole) {
                        const member = await guild.members.fetch(sanction.userId).catch(() => null);
                        if (member) {
                            await member.roles.remove(muteRole, 'Mute expiré automatiquement').catch(() => {});
                        }
                    }
                } else if (sanction.type === 'tempban') {
                    LogDispatcher.markModerationAction(guild.id, 'unban', sanction.userId);
                    await guild.members.unban(sanction.userId, 'Ban temporaire expiré').catch(() => {});
                }

                await Sanction.updateOne({ _id: sanction._id }, { $set: { active: false } });

            } catch (err) {
                Logger.error(`Erreur traitement sanction expirée ${sanction._id}:`, err);
            }
        }
    },
};

module.exports = ModerationService;
