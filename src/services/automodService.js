'use strict';

const AutomodStrike = require('../models/AutomodStrike');
const SecurityLog = require('../models/SecurityLog');
const Logger = require('../utils/logger');
const EmbedHelper = require('../utils/embedBuilder');
const LogDispatcher = require('../utils/logDispatcher');
const { isWhitelisted } = require('../utils/whitelist');

let filter = null;
function getFilter() {
    if (!filter) {
        try { filter = new (require('bad-words'))(); } catch { filter = { isProfane: () => false }; }
    }
    return filter;
}
const floodHistory = new Map();
const strikeLocks = new Map(); // guildId:userId → Promise (sérialise les strikes)
const autoDeletedMessages = new Set(); // ids de messages supprimés par l'automod lui-même
let lastFloodSweep = 0;
const FLOOD_SWEEP_INTERVAL = 60 * 60 * 1000; // 1 h
const FLOOD_ENTRY_TTL = 30 * 60 * 1000;      // 30 min

// Sans http/www, on exige une extension de domaine connue (« ok.merci » n'est pas un lien),
// ou un chemin après le domaine (« site.abc/page »).
const LINK_REGEX = /(?:https?:\/\/|www\.)[^\s]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|fr|io|gg|xyz|me|tv|co|be|ch|ca|de|uk|us|eu|info|app|dev|link|ly|to|ru|es|it|site|online|shop|store|live|pro|biz|club|gl|cc|ws|tk|ml|ga|cf|gq|ai|sh|so|top|click|lol|gift|win|vip|cloud|space|website|fun|icu|cn|in|nl|pl|pt|br|tech|fyi|bio|page|plus|pw|su|ink|one)\b(?:\/[^\s]*)?|\b[a-z0-9-]{2,}\.[a-z]{2,24}\/[^\s]*/i;
const INVITE_REGEX = /(?:discord(?:app)?\.(?:gg|io|me|li|com\/invite)|invite\.gg|dsc\.gg|discord\.com\/servers)\/[a-z0-9-]+/i;
// Cadeaux Nitro (vrais ou faux) et faux domaines Discord d'arnaque (« dlscord », « disc0rd »…).
const GIFT_REGEX = /(?:discord(?:app)?\.(?:gift|com\/gifts?|com\/billing\/promotions)|promos\.discord\.gg)\/?[a-z0-9-]*|\b(?!discord(?:app)?\.)d[i1l!]{1,2}s?[ckq][o0]{1,2}r[dt][a-z0-9-]*(?:\.(?:com|net|org|gift|gg|xyz|ru|site|online|shop|store|io|me|ly|to|app|link|click|top|fun|icu|cc|pw|su|win|vip|space|website|live|pro)\b|\.[a-z]{2,24}\/)|\bn[i1]tr[o0][a-z0-9-]*(?:\.(?:com|net|org|gift|gg|xyz|ru|site|online|shop|store|io|me|ly|to|app|link|click|top|fun|icu|cc|pw|su|win|vip|space|website|live|pro)\b|\.[a-z]{2,24}\/)/i;
const LINK_REASONS = new Set(['link', 'invite', 'gift']);
const LINK_BURST = { count: 3, window: 30_000 };
const WARN_COOLDOWN = 8_000;
const linkBursts = new Map();    // guildId:userId → horodatages des derniers liens bloqués
const warnCooldowns = new Map(); // guildId:userId → fin de la pause entre deux avertissements

/**
 * Tout le texte d'un message où un lien peut se cacher : contenu, embeds, boutons
 * (« Rejoindre »), messages transférés. Les déguisements courants (« discord . gg »,
 * « discord[.]gg », caractères invisibles) sont retirés pour la détection.
 */
function messageLinkText(message) {
    const parts = [message.content || ''];
    const addEmbeds = embeds => {
        for (const e of embeds || []) {
            parts.push(e.url, e.title, e.description, e.author?.url, e.footer?.text, ...(e.fields || []).flatMap(f => [f.name, f.value]));
        }
    };
    const addComponents = components => {
        for (const c of components || []) {
            const data = c.data ?? c;
            if (data.url) parts.push(data.url);
            if (typeof data.content === 'string') parts.push(data.content);
            addComponents(c.components);
            if (c.accessory) addComponents([c.accessory]);
        }
    };
    addEmbeds(message.embeds);
    addComponents(message.components);
    for (const snapshot of message.messageSnapshots?.values?.() || []) {
        parts.push(snapshot.content || '');
        addEmbeds(snapshot.embeds);
        addComponents(snapshot.components);
    }
    return parts.filter(Boolean).join('\n')
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\s*(?:\[\.\]|\(\.\)|\{\.\}|\[dot\]|\(dot\))\s*/gi, '.')
        .replace(/[ \t]*([./\\])[ \t]*/g, '$1')
        .replace(/\\/g, '/');
}

/** Retire les domaines autorisés avant de chercher les liens restants. */
function withoutWhitelisted(text, whitelist = []) {
    let out = String(text || '').toLowerCase();
    for (const entry of whitelist || []) if (entry) out = out.split(String(entry).toLowerCase()).join(' ');
    return out;
}

/** Lien interdit dans le message, selon le mode : 'all' (tout lien) ou 'invite' (Discord). */
function findLinkViolation(message, whitelist, mode) {
    const text = withoutWhitelisted(messageLinkText(message), whitelist);
    if (GIFT_REGEX.test(text)) return 'gift';
    // message.activity : invitation « Rejoindre » vers un jeu ou une activité Discord.
    if (INVITE_REGEX.test(text) || message.activity) return 'invite';
    if (mode !== 'invite' && LINK_REGEX.test(text)) return 'link';
    return null;
}

const LINK_WARNINGS = {
    link: 'les liens ne sont pas autorisés ici',
    invite: 'les invitations vers d\'autres serveurs ne sont pas autorisées ici',
    gift: 'les liens cadeaux (Nitro) ne sont pas autorisés ici',
};

// L'automod tourne dès qu'une protection est activée : avant, « +antilink on » ne servait
// à rien tant que l'interrupteur général automod.enabled n'avait pas été allumé ailleurs.
function isAutomodActive(settings) {
    const automod = settings?.automod;
    if (!automod) return false;
    if (automod.enabled) return true;
    return Object.values(automod).some(module => module && typeof module === 'object' && module.enabled === true)
        || (Array.isArray(automod.selfieChannels) && automod.selfieChannels.length > 0);
}

const REASON_TO_MODULE = {
    spam: 'antispam',
    flood: 'antiflood',
    link: 'antilink',
    invite: 'antiinvite',
    gift: 'antilink',
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
    sweepFloodHistory();
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

// Évite une fuite mémoire : purge périodiquement les clés dont l'historique est vide
// ou devenu trop ancien (l'utilisateur a cessé de parler).
function sweepFloodHistory(force = false) {
    const now = Date.now();
    if (!force && now - lastFloodSweep < FLOOD_SWEEP_INTERVAL) return;
    lastFloodSweep = now;
    for (const [key, history] of floodHistory.entries()) {
        const active = (history || []).filter(entry => now - entry.timestamp < FLOOD_ENTRY_TTL);
        if (active.length === 0) floodHistory.delete(key);
        else if (active.length !== history.length) floodHistory.set(key, active);
    }
}

function canUseModerationAction(member, action) {
    if (!member) return false;
    if (action === 'timeout') return member.moderatable !== false;
    if (action === 'kick') return member.kickable !== false;
    if (action === 'ban') return member.bannable !== false;
    return true;
}

async function isTrustedMember(client, message, settings) {
    const member = message.member;
    if (!member) return false;
    if (client.botOwners?.has(message.author.id) || client.owners?.has(message.author.id)) return true;
    if (settings?.owners?.includes(message.author.id)) return true;
    const wl = settings?.antiraid?.whitelist || [];
    return isWhitelisted(member, message.author.id, wl);
}

function recordLinkBurst(message) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const recent = (linkBursts.get(key) || []).filter(t => now - t < LINK_BURST.window);
    recent.push(now);
    linkBursts.set(key, recent);
    if (linkBursts.size > 5000) for (const [k, list] of linkBursts) if (!list.some(t => now - t < LINK_BURST.window)) linkBursts.delete(k);
    return recent.length;
}

// Un avertissement par membre toutes les 8 s au plus : pas de pluie de messages pendant un spam.
function canWarn(message) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    if ((warnCooldowns.get(key) || 0) > now) return false;
    warnCooldowns.set(key, now + WARN_COOLDOWN);
    if (warnCooldowns.size > 5000) for (const [k, until] of warnCooldowns) if (until <= now) warnCooldowns.delete(k);
    return true;
}

async function sendTemporaryWarning(message, content) {
    await message.channel.send(content)
        .then(sentMessage => setTimeout(() => sentMessage.delete().catch(() => {}), 5000))
        .catch(() => {});
}

const AutomodService = {
    isActive: isAutomodActive,

    async check(client, message, settings) {
        if (!isAutomodActive(settings)) return false;
        const automod = settings.automod;

        if (!message.guild || message.author?.bot || !message.member) return false;
        if (automod.ignoredRoles?.some(roleId => message.member.roles.cache.has(roleId))) return false;
        if (automod.ignoredChannels?.includes(message.channelId)) return false;

        // Détection d'abord (que du calcul) : la vérification de confiance peut demander
        // un appel Discord, elle n'est faite que si quelque chose a été trouvé.
        const violation = await this.detectViolation(client, message, settings);
        if (!violation) return false;
        if (await isTrustedMember(client, message, settings)) return false;

        await this.handleViolation(client, message, settings, violation);
        return true;
    },

    /**
     * Message envoyé par une appli au nom d'un membre (appli installée sur son compte) :
     * souvent une invitation avec un bouton « Rejoindre ». Seul l'antilink s'applique,
     * et la sanction vise le membre qui a lancé l'appli.
     */
    async checkAppMessage(client, message, settings) {
        const userId = message.interactionMetadata?.user?.id;
        if (!userId || message.author?.id === client.user?.id || !isAutomodActive(settings)) return false;
        const member = await message.guild.members.fetch(userId).catch(() => null);
        if (!member) return false;
        const asMember = Object.create(message, { member: { value: member }, author: { value: member.user } });
        const violation = this.detectLinks(asMember, settings.automod);
        if (!violation) return false;
        if (await isTrustedMember(client, asMember, settings)) return false;
        await this.handleViolation(client, asMember, settings, violation);
        return true;
    },

    detectLinks(message, automod) {
        if (automod.antiinvite?.enabled && !isChannelIgnored(message.channelId, automod.antiinvite.ignoredChannels)) {
            const found = findLinkViolation(message, automod.antiinvite.whitelist, 'invite');
            if (found) return { reason: found, moduleKey: 'antiinvite', count: 1 };
        }
        if (automod.antilink?.enabled && !isChannelIgnored(message.channelId, automod.antilink.ignoredChannels)) {
            const found = findLinkViolation(message, automod.antilink.whitelist, automod.antilink.mode || 'all');
            if (found) return { reason: found, moduleKey: 'antilink', count: 1 };
        }
        return null;
    },

    async detectViolation(client, message, settings) {
        const automod = settings.automod;
        const content = message.content || '';

        // Liens d'abord : c'est la menace la plus urgente (arnaques, pub).
        const linkViolation = this.detectLinks(message, automod);
        if (linkViolation) return linkViolation;

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

            // Mot entier uniquement : « con » ne doit pas bloquer « conseil » ou « content ».
            let hasBadWord = customWords.some(word => {
                const escaped = String(word).toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return escaped && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(lowerContent);
            });
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
        // Marque le message comme supprimé par l'automod : le hook ghostping (messageDelete)
        // ne doit alors PAS ajouter un double strike à l'utilisateur.
        if (message?.id) {
            autoDeletedMessages.add(message.id);
            setTimeout(() => autoDeletedMessages.delete(message.id), 10_000);
        }
        await message.delete().catch(() => {});
        await this.applyStrike(client, message, violation.reason, settings, violation);
    },

    async handleGhostPing(client, message, settings) {
        if (!settings?.automod?.antighostping?.enabled) return false;
        if (!message.guild || message.author?.bot || !message.member) return false;
        // Ne pas pénaliser deux fois un message déjà supprimé par l'automod lui-même.
        if (message?.id && autoDeletedMessages.has(message.id)) {
            autoDeletedMessages.delete(message.id);
            return false;
        }
        if (await isTrustedMember(client, message, settings)) return false;

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

        // Sérialise les strikes par utilisateur : évite qu'une race condition
        // (deux violations simultanées) incrémente deux fois depuis le même compteur.
        const lockKey = `${message.guild.id}:${message.author.id}`;
        const prev = strikeLocks.get(lockKey) || Promise.resolve();
        const release = () => strikeLocks.delete(lockKey);
        const run = prev
            .catch(() => { /* un échec précédent ne doit pas bloquer les strikes suivants */ })
            .then(async () => {
                try {
                    const userStrikes = await this.getStrikes(message.author.id, message.guild.id);
                    const newCount = userStrikes + 1;
                    await this.setStrikes(message.author.id, message.guild.id, newCount);

                    let punishment = this.resolvePunishment(automod, newCount, extra.moduleKey || REASON_TO_MODULE[reason]);
                    // Spam de liens (3 en 30 s) : TO direct, quelle que soit la sanction prévue.
                    if (LINK_REASONS.has(reason) && recordLinkBurst(message) >= LINK_BURST.count
                        && (!punishment || punishment === 'warn')) punishment = 'timeout';
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

                    if (!canWarn(message)) return;
                    const what = LINK_WARNINGS[reason] || `violation détectée (${reason})`;
                    await sendTemporaryWarning(
                        message,
                        `🚫 ${message.author}, ${what}. Avertissement ${newCount}/${maxStrikes}.`
                    );
                } finally {
                    release();
                }
            });
        strikeLocks.set(lockKey, run);
        await run;
    },

    resolvePunishment(automod, strikesCount, moduleKey = null) {
        // La sanction du module est un minimum ; les strikes peuvent l'aggraver.
        // (Avant, la sanction par défaut « warn » court-circuitait toute l'escalade :
        // un récidiviste n'était jamais timeout/kick/ban.)
        const SEVERITY = ['warn', 'timeout', 'kick', 'ban'];
        const configured = moduleKey ? automod?.[moduleKey]?.punishment : null;

        const strikes = automod.strikes || { warn: 3, timeout: 5, mute: 5, kick: 7, ban: 10 };
        let byStrikes = null;
        const timeoutThreshold = strikes.timeout || strikes.mute;
        if (strikes.ban && strikesCount >= strikes.ban) byStrikes = 'ban';
        else if (strikes.kick && strikesCount >= strikes.kick) byStrikes = 'kick';
        else if (timeoutThreshold && strikesCount >= timeoutThreshold) byStrikes = 'timeout';
        else if (strikes.warn && strikesCount >= strikes.warn) byStrikes = 'warn';

        const candidates = [configured, byStrikes].filter(p => SEVERITY.includes(p));
        if (!candidates.length) return null;
        return candidates.reduce((a, b) => (SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a));
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
                        await member.roles.add(muteRole, auditReason);
                        await sendTemporaryWarning(message, `🔇 **${member.user.username}** a été mute par l'automod (${count} strikes).`);
                        break;
                    }
                    if (canUseModerationAction(member, 'timeout')) {
                        await member.timeout(timeoutDuration, auditReason);
                        await sendTemporaryWarning(message, `⏱️ **${member.user.username}** a été timeout par l'automod (${count} strikes).`);
                    }
                    break;
                }
                case 'kick':
                    if (canUseModerationAction(member, 'kick')) {
                        LogDispatcher.markModerationAction(message.guild.id, 'kick', member.id);
                        await member.kick(auditReason);
                        await AutomodStrike.reset({ userId: member.id, guildId: message.guild.id });
                        await sendTemporaryWarning(message, `👢 **${member.user.username}** a été expulsé par l'automod (${count} strikes).`);
                    }
                    break;
                case 'ban':
                    if (canUseModerationAction(member, 'ban')) {
                        LogDispatcher.markModerationAction(message.guild.id, 'ban', member.id);
                        await message.guild.members.ban(member.id, { reason: auditReason, deleteMessageSeconds: 7 * 86400 });
                        await AutomodStrike.reset({ userId: member.id, guildId: message.guild.id });
                        await sendTemporaryWarning(message, `🔨 **${member.user.username}** a été banni par l'automod (${count} strikes).`);
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
