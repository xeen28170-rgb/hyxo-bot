'use strict';

const AutomodStrike = require('../models/AutomodStrike');
const SecurityLog = require('../models/SecurityLog');
const Logger = require('../utils/logger');
const EmbedHelper = require('../utils/embedBuilder');
const LogDispatcher = require('../utils/logDispatcher');

let filter = null;
function getFilter() {
    if (!filter) {
        try { filter = new (require('bad-words'))(); } catch { filter = { isProfane: () => false }; }
    }
    return filter;
}
const floodHistory = new Map();

const LINK_REGEX = /(?:https?:\/\/|www\.)[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/i;
const INVITE_REGEX = /(?:discord\.gg|discord(?:app)?\.com\/invite|invite\.gg|dsc\.gg|discord\.me)\/[a-z0-9-]+/i;

const REASON_TO_MODULE = {
    spam: 'antispam',
    flood: 'antiflood',
    link: 'antilink',
    invite: 'antiinvite',
    mention: 'antimassmention',
    ghostping: 'antighostping',
    everyone: 'antieveryone',
    here: 'antihere',
    badword: 'badwords',
    selfie: 'selfieChannels',
};

function isChannelIgnored(channelId, ...lists) {
    return lists.some(list => Array.isArray(list) && list.includes(channelId));
}

function isWhitelistedContent(content, whitelist = []) {
    const lowerContent = String(content || '').toLowerCase();
    return whitelist.some(entry => entry && lowerContent.includes(String(entry).toLowerCase()));
}

function normalizeContent(content) {
    return String(content || '')
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function similarityScore(leftContent, rightContent) {
    const left = normalizeContent(leftContent);
    const right = normalizeContent(rightContent);
    if (!left || !right) return 0;
    if (left === right) return 1;

    const leftTokens = new Set(left.split(' '));
    const rightTokens = new Set(right.split(' '));
    const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return union ? intersection / union : 0;
}

function getFloodKey(message) {
    return `${message.guild.id}:${message.author.id}`;
}

function recordFloodMessage(message, duration) {
    const now = Date.now();
    const key = getFloodKey(message);
    const history = floodHistory.get(key) || [];
    const freshHistory = history.filter(entry => now - entry.timestamp < duration);
    freshHistory.push({ content: message.content || '', timestamp: now });
    floodHistory.set(key, freshHistory);
    return freshHistory;
}

function clearFloodHistory(message) {
    floodHistory.delete(getFloodKey(message));
}

function canUseModerationAction(member, action) {
    if (!member) return false;
    if (action === 'timeout') return member.moderatable !== false;
    if (action === 'kick') return member.kickable !== false;
    if (action === 'ban') return member.bannable !== false;
    return true;
}

function isTrustedMember(client, message, settings) {
    const member = message.member;
    if (!member) return false;
    if (client.botOwners?.has(message.author.id) || client.owners?.has(message.author.id)) return true;
    if (settings?.owners?.includes(message.author.id)) return true;
    if (settings?.antiraid?.whitelist?.includes(message.author.id)) return true;
    return false;
}

async function sendTemporaryWarning(message, content) {
    await message.channel.send(content)
        .then(sentMessage => setTimeout(() => sentMessage.delete().catch(() => {}), 5000))
        .catch(() => {});
}

const AutomodService = {
    async check(client, message, settings) {
        if (!settings?.automod?.enabled) return false;
        const automod = settings.automod;

        if (!message.guild || message.author?.bot || !message.member) return false;
        if (automod.ignoredRoles?.some(roleId => message.member.roles.cache.has(roleId))) return false;
        if (automod.ignoredChannels?.includes(message.channelId)) return false;
        if (isTrustedMember(client, message, settings)) return false;

        const violation = await this.detectViolation(client, message, settings);
        if (!violation) return false;

        await this.handleViolation(client, message, settings, violation);
        return true;
    },

    async detectViolation(client, message, settings) {
        const automod = settings.automod;
        const content = message.content || '';

        if (automod.antispam?.enabled && !isChannelIgnored(message.channelId, automod.antispam.ignoredChannels)) {
            const duration = automod.antispam.duration || 5000;
            const count = client.cache.trackMessage(message.author.id, message.guild.id, duration);
            if (count >= (automod.antispam.threshold || 5)) {
                return { reason: 'spam', moduleKey: 'antispam', count };
            }
        }

        if (automod.antiflood?.enabled && !isChannelIgnored(message.channelId, automod.antiflood.ignoredChannels)) {
            const duration = automod.antiflood.duration || 10000;
            const threshold = automod.antiflood.threshold || 4;
            const minSimilarity = automod.antiflood.similarity || 0.85;
            const history = recordFloodMessage(message, duration);
            const similarCount = history.filter(entry => similarityScore(content, entry.content) >= minSimilarity).length;
            if (similarCount >= threshold) {
                clearFloodHistory(message);
                return { reason: 'flood', moduleKey: 'antiflood', count: similarCount };
            }
        }

        if (automod.antiinvite?.enabled && !isChannelIgnored(message.channelId, automod.antiinvite.ignoredChannels)) {
            if (INVITE_REGEX.test(content) && !isWhitelistedContent(content, automod.antiinvite.whitelist)) {
                return { reason: 'invite', moduleKey: 'antiinvite', count: 1 };
            }
        }

        if (automod.antilink?.enabled && !isChannelIgnored(message.channelId, automod.antilink.ignoredChannels)) {
            const mode = automod.antilink.mode || 'all';
            const hasLink = mode === 'invite' ? INVITE_REGEX.test(content) : LINK_REGEX.test(content);
            if (hasLink && !isWhitelistedContent(content, automod.antilink.whitelist)) {
                return { reason: mode === 'invite' ? 'invite' : 'link', moduleKey: 'antilink', count: 1 };
            }
        }

        if (automod.antieveryone?.enabled && message.mentions?.everyone && /@everyone/i.test(content)) {
            return { reason: 'everyone', moduleKey: 'antieveryone', count: 1 };
        }

        if (automod.antihere?.enabled && /@here/i.test(content)) {
            return { reason: 'here', moduleKey: 'antihere', count: 1 };
        }

        if (automod.antimassmention?.enabled) {
            const mentionCount = (message.mentions.users.size || 0) + (message.mentions.roles.size || 0);
            if (mentionCount >= (automod.antimassmention.threshold || 5)) {
                return { reason: 'mention', moduleKey: 'antimassmention', count: mentionCount };
            }
        }

        if (automod.badwords?.enabled) {
            const customWords = automod.badwords.words || [];
            const lowerContent = content.toLowerCase();

            let hasBadWord = customWords.some(word => lowerContent.includes(String(word).toLowerCase()));
            if (!hasBadWord) {
                try { hasBadWord = getFilter().isProfane(content); } catch { /* ignore */ }
            }

            if (hasBadWord) return { reason: 'badword', moduleKey: 'badwords', count: 1 };
        }

        if (automod.selfieChannels?.includes(message.channelId)) {
            if (!message.attachments.size && !message.embeds.length) {
                return { reason: 'selfie', moduleKey: 'selfieChannels', count: 1 };
            }
        }

        return null;
    },

    async handleViolation(client, message, settings, violation) {
        await message.delete().catch(() => {});
        await this.applyStrike(client, message, violation.reason, settings, violation);
    },

    async handleGhostPing(client, message, settings) {
        if (!settings?.automod?.enabled || !settings.automod?.antighostping?.enabled) return false;
        if (!message.guild || message.author?.bot || !message.member) return false;
        if (isTrustedMember(client, message, settings)) return false;

        const mentionedUsers = message.mentions?.users?.filter(user => !user.bot) || new Map();
        const mentionedRoles = message.mentions?.roles || new Map();
        const mentionedEveryone = Boolean(message.mentions?.everyone);

        if (!mentionedUsers.size && !mentionedRoles.size && !mentionedEveryone) return false;

        const detail = [
            mentionedUsers.size ? `Utilisateurs: ${mentionedUsers.map(user => `<@${user.id}>`).join(', ')}` : null,
            mentionedRoles.size ? `Rôles: ${mentionedRoles.map(role => `<@&${role.id}>`).join(', ')}` : null,
            mentionedEveryone ? '@everyone/@here' : null,
        ].filter(Boolean).join('\n');

        await this.applyStrike(client, message, 'ghostping', settings, {
            reason: 'ghostping',
            moduleKey: 'antighostping',
            count: mentionedUsers.size + mentionedRoles.size + (mentionedEveryone ? 1 : 0),
            details: { mentions: detail },
            deletedMessage: true,
        });

        await message.channel.send({
            embeds: [EmbedHelper.warning(`👻 Ghost ping détecté de ${message.author}.\n${detail}`)],
        }).then(sentMessage => setTimeout(() => sentMessage.delete().catch(() => {}), 8000)).catch(() => {});

        return true;
    },

    async applyStrike(client, message, reason, settings, extra = {}) {
        const automod = settings.automod;
        const member = message.member;
        if (!member) return;

        const userStrikes = await this.getStrikes(message.author.id, message.guild.id);
        const newCount = userStrikes + 1;
        await this.setStrikes(message.author.id, message.guild.id, newCount);

        const punishment = this.resolvePunishment(automod, newCount, extra.moduleKey || REASON_TO_MODULE[reason]);
        const maxStrikes = automod.strikes?.ban || 10;

        await this.logAutomod(client, message, settings, {
            reason,
            moduleKey: extra.moduleKey || REASON_TO_MODULE[reason],
            count: extra.count || 1,
            strikes: newCount,
            punishment: punishment || 'none',
            details: extra.details || {},
        });

        if (punishment) {
            await this.executePunishment(client, message, punishment, newCount, reason, settings);
            return;
        }

        await sendTemporaryWarning(
            message,
            `🚫 ${message.author}, violation détectée (${reason}). Strike ${newCount}/${maxStrikes}.`
        );
    },

    resolvePunishment(automod, strikesCount, moduleKey = null) {
        const configuredPunishment = moduleKey ? automod?.[moduleKey]?.punishment : null;
        if (['warn', 'timeout', 'kick', 'ban'].includes(configuredPunishment)) return configuredPunishment;

        const strikes = automod.strikes || { warn: 3, timeout: 5, mute: 5, kick: 7, ban: 10 };
        if (strikes.ban && strikesCount >= strikes.ban) return 'ban';
        if (strikes.kick && strikesCount >= strikes.kick) return 'kick';
        const timeoutThreshold = strikes.timeout || strikes.mute;
        if (timeoutThreshold && strikesCount >= timeoutThreshold) return 'timeout';
        if (strikes.warn && strikesCount >= strikes.warn) return 'warn';
        return null;
    },

    async executePunishment(client, message, punishment, count, reason, settings) {
        const auditReason = `[AUTOMOD] ${count} strikes — ${reason}`;
        const member = message.member;
        if (!member) return;

        try {
            switch (punishment) {
                case 'warn':
                    await sendTemporaryWarning(message, `⚠️ **${member.user.username}** a reçu un avertissement automod (${count} strikes).`);
                    break;
                case 'timeout': {
                    const timeoutDuration = Math.min(settings.automod?.timeoutDuration || 60 * 60 * 1000, 28 * 24 * 60 * 60 * 1000);
                    const muteRole = settings.moderation?.muteRole;
                    if (!settings.moderation?.useTimeout && muteRole && member.roles?.add) {
                        await member.roles.add(muteRole, auditReason).catch(() => {});
                        await sendTemporaryWarning(message, `🔇 **${member.user.username}** a été mute par l'automod (${count} strikes).`);
                        break;
                    }
                    if (canUseModerationAction(member, 'timeout')) {
                        await member.timeout(timeoutDuration, auditReason).catch(() => {});
                        await sendTemporaryWarning(message, `⏱️ **${member.user.username}** a été timeout par l'automod (${count} strikes).`);
                    }
                    break;
                }
                case 'kick':
                    if (canUseModerationAction(member, 'kick')) {
                        await sendTemporaryWarning(message, `👢 **${member.user.username}** a été expulsé par l'automod (${count} strikes).`);
                        LogDispatcher.markModerationAction(message.guild.id, 'kick', member.id);
                        await member.kick(auditReason).catch(() => {});
                        await AutomodStrike.reset({ userId: member.id, guildId: message.guild.id });
                    }
                    break;
                case 'ban':
                    if (canUseModerationAction(member, 'ban')) {
                        await sendTemporaryWarning(message, `🔨 **${member.user.username}** a été banni par l'automod (${count} strikes).`);
                        LogDispatcher.markModerationAction(message.guild.id, 'ban', member.id);
                        await message.guild.members.ban(member.id, { reason: auditReason, deleteMessageSeconds: 7 * 86400 }).catch(() => {});
                        await AutomodStrike.reset({ userId: member.id, guildId: message.guild.id });
                    }
                    break;
            }
        } catch (error) {
            Logger.error('Erreur punition automod:', { message: error.message });
        }
    },

    async logAutomod(client, message, settings, data) {
        await SecurityLog.create({
            type: 'automod',
            module: data.moduleKey,
            action: data.reason,
            guildId: message.guild.id,
            userId: message.author.id,
            userTag: message.author.tag,
            reason: data.reason,
            punishment: data.punishment,
            count: data.count,
            details: {
                strikes: data.strikes,
                channelId: message.channelId,
                content: String(message.content || '').slice(0, 500),
                ...data.details,
            },
        });

        const embed = EmbedHelper.log({
            title: '🛡️ AUTOMOD — Action sécurité',
            color: EmbedHelper.Colors.AUTOMOD,
            fields: [
                { name: '👤 Utilisateur', value: `${message.author.tag} (\`${message.author.id}\`)`, inline: false },
                { name: '📦 Module', value: `\`${data.moduleKey || 'unknown'}\``, inline: true },
                { name: '📝 Raison', value: `\`${data.reason}\``, inline: true },
                { name: '⚠️ Strikes', value: `\`${data.strikes}\``, inline: true },
                { name: '🔨 Sanction', value: `\`${data.punishment}\``, inline: true },
                { name: '📍 Salon', value: `<#${message.channelId}>`, inline: true },
            ],
        });

        await LogDispatcher.security(message.guild, embed);
    },

    async getStrikes(userId, guildId) {
        const data = await AutomodStrike.findOne({ userId, guildId });
        return data ? data.count : 0;
    },

    async setStrikes(userId, guildId, count) {
        await AutomodStrike.findOneAndUpdate(
            { userId, guildId },
            { count, lastStrikeAt: Date.now() },
            { upsert: true, new: true }
        );
    },

    async resetStrikes(userId, guildId) {
        await AutomodStrike.reset({ userId, guildId });
    },
};

module.exports = AutomodService;
