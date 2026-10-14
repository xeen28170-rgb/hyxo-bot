'use strict';

const { ChannelType, MessageFlags } = require('discord.js');
const Helpers = require('../utils/helpers');
const { safeSetTimeout } = require('../utils/safeTimeout');
const Logger = require('../utils/logger');

function deleteLater(message, config) {
    if (!config || !message?.delete) return;
    const delay = config.duration ? Helpers.parseDuration(config.duration) : 5000;
    if (!delay) return;
    safeSetTimeout(() => (cleanedUp.add(message.id), message).delete().catch(error => {
        if (error.code !== 10008) Logger.error('[Autodelete]', error.message);
    }), delay).unref?.();
}

// Messages de commande supprimés par le bot après exécution (ignorés par messageDelete).
const cleanedUp = new Set();

module.exports = {
    wasCleanedUp: id => cleanedUp.has(id),

    async onMessage(message, settings) {
        if (settings.config?.autopublishChannels?.includes(message.channelId)
            && message.channel.type === ChannelType.GuildAnnouncement && !message.flags?.has(MessageFlags.Crossposted)) {
            try { await message.crosspost(); } catch (error) { Logger.error('[Autopublish]', error.message); }
        }
        const emojis = new Set((settings.config?.autoreacts || []).filter(r => r.channelId === message.channelId).map(r => r.emoji));
        for (const emoji of emojis) {
            try { await message.react(emoji); } catch (error) { Logger.error('[Autoreact]', error.message); }
        }
    },

    commandMessage(message, command, settings) {
        const scope = command.name === 'snipe' ? 'snipe' : command.category === 'moderation' ? 'moderation' : null;
        const raw = scope && settings.autodelete?.[scope];
        if (!raw) return message;
        const config = raw.target ? { [raw.target]: raw } : raw;
        deleteLater(message, config.commande);
        if (!config.reply) return message;
        // Proxy local a cette commande : ne jamais modifier channel.send globalement.
        const channel = new Proxy(message.channel, {
            get(target, key) {
                if (key === 'send') return async (...args) => {
                    const reply = await target.send(...args);
                    deleteLater(reply, config.reply);
                    return reply;
                };
                const value = Reflect.get(target, key, target);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
        const wrapped = Object.create(message);
        Object.defineProperty(wrapped, 'channel', { value: channel });
        Object.defineProperty(wrapped, 'reply', { value: async (...args) => {
            const reply = await message.reply(...args);
            deleteLater(reply, config.reply);
            return reply;
        } });
        return wrapped;
    },

    /**
     * Retient les réponses envoyées pendant une commande, pour le nettoyage d'après-commande.
     * Une réponse est « courte » si elle ne contient que des embeds de succès / erreur /
     * avertissement, sans boutons ni fichiers : ce sont les seules qui seront supprimées.
     */
    trackReplies(message, replies) {
        const isShort = options => {
            if (!options || typeof options !== 'object') return false;
            const embeds = options.embeds || [];
            return embeds.length > 0 && embeds.every(e => e?.statusKind)
                && !options.components?.length && !options.files?.length && !options.content;
        };
        const remember = send => async (...args) => {
            const reply = await send(...args);
            if (reply?.delete) replies.push({ reply, short: isShort(args[0]) });
            return reply;
        };
        const channel = new Proxy(message.channel, {
            get(target, key) {
                if (key === 'send') return remember(target.send.bind(target));
                const value = Reflect.get(target, key, target);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
        const wrapped = Object.create(message);
        Object.defineProperty(wrapped, 'channel', { value: channel });
        Object.defineProperty(wrapped, 'reply', { value: remember(message.reply.bind(message)) });
        return wrapped;
    },

    /**
     * Après une commande : le message de la personne est supprimé tout de suite, et les
     * réponses courtes après 10 s. Les panneaux, infos, listes et fiches restent.
     * Réglable par serveur : +autodelete tout commande off / +autodelete tout reply off|<durée>.
     */
    cleanupAfterCommand(message, replies, settings) {
        const all = settings?.autodelete?.all || {};
        if (all.commande !== null && message.delete) {
            // Suppression du bot : pas de snipe, pas de log « message supprimé », pas de ghost ping.
            cleanedUp.add(message.id);
            setTimeout(() => cleanedUp.delete(message.id), 60_000).unref?.();
            message.delete().catch(() => cleanedUp.delete(message.id));
        }
        if (all.reply === null) return;
        const delay = Helpers.parseDuration(all.reply?.duration || '10s') || 10_000;
        for (const { reply, short } of replies) {
            if (!short) continue;
            safeSetTimeout(() => reply.delete().catch(() => {}), delay).unref?.();
        }
    },
};
