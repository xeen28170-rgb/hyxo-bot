'use strict';

const Sanction = require('../models/Sanction');
const Logger = require('../utils/logger');
const EmbedHelper = require('../utils/embedBuilder');
const Helpers = require('../utils/helpers');
const LogDispatcher = require('../utils/logDispatcher');
const { getGuildSettings } = require('../utils/guildSettings');
const { withKey } = require('../utils/keyedQueue');

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

        const embed = EmbedHelper.moderation({
            action: sanction.type,
            user: target,
            moderator,
            reason: sanction.reason,
            duration: sanction.duration ? Helpers.formatDuration(sanction.duration) : null,
            caseId: sanction.caseId,
        });

        // Non bloquant : les commandes de modération (ban, mute, kick, warn…) attendaient ce
        // message dans le salon de logs avant de confirmer à l'utilisateur.
        Promise.resolve(LogDispatcher.moderationAction(guild, sanction.type, embed)).catch(error => {
            Logger.error('[ModLog] Envoi du log de modération impossible:', { message: error.message });
        });
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
        return withKey('sanctions-expiration', () => this.expirePending(client));
    },
    async expirePending(client) {
        const expired = (await Sanction.getExpired()).slice(0, 50);

        for (const sanction of expired) {
            try {
                const latest = await Sanction.findOne({ _id: sanction._id });
                if (!latest?.active) continue;
                const guild = client.guilds.cache.get(sanction.guildId);
                if (!guild) {
                    continue;
                }

                const settings = await getGuildSettings(client, sanction.guildId, { create: false });
                const group = ['mute', 'tempmute'].includes(sanction.type) ? ['mute', 'tempmute']
                    : ['ban', 'tempban'].includes(sanction.type) ? ['ban', 'tempban'] : ['cmute', 'tempcmute'];
                const active = await Sanction.find({ guildId: sanction.guildId, userId: sanction.userId, active: true });
                if (active.some(s => group.includes(s.type) && s._id > sanction._id)) {
                    await Sanction.updateOne({ _id: sanction._id }, { active: false });
                    continue;
                }

                if (sanction.type === 'tempmute' || sanction.type === 'mute') {
                    const muteRole = sanction.metadata?.muteRoleId || settings?.moderation?.muteRole;
                    if (!(sanction.metadata?.useTimeout ?? settings?.moderation?.useTimeout) && !muteRole) continue;
                    if (muteRole && !(sanction.metadata?.useTimeout ?? settings?.moderation?.useTimeout)) {
                        const member = await guild.members.fetch(sanction.userId).catch(error => {
                            if (error.code === 10007) return null;
                            throw error;
                        });
                        if (member) {
                            await member.roles.remove(muteRole, 'Mute expiré automatiquement');
                        }
                    }
                } else if (sanction.type === 'tempban') {
                    LogDispatcher.markModerationAction(guild.id, 'unban', sanction.userId);
                    await guild.members.unban(sanction.userId, 'Ban temporaire expiré').catch(error => {
                        if (error.code !== 10026) throw error;
                    });
                } else if (sanction.type === 'tempcmute') {
                    const member = await guild.members.fetch(sanction.userId).catch(error => {
                        if (error.code === 10007) return null;
                        throw error;
                    });
                    if (member && !member.voice.channelId) continue;
                    if (member?.voice.serverMute) await member.voice.setMute(false, 'Cmute expire');
                }

                await Sanction.updateOne({ _id: sanction._id }, { $set: { active: false } });

            } catch (err) {
                Logger.error(`Erreur traitement sanction expirée ${sanction._id}:`, err);
            }
        }
    },
};

module.exports = ModerationService;
