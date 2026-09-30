'use strict';

const { ChannelType, MessageFlags } = require('discord.js');
const Helpers = require('../utils/helpers');
const { safeSetTimeout } = require('../utils/safeTimeout');
const Logger = require('../utils/logger');

function deleteLater(message, config) {
    if (!config || !message?.delete) return;
    const delay = config.duration ? Helpers.parseDuration(config.duration) : 5000;
    if (!delay) return;
    safeSetTimeout(() => message.delete().catch(error => {
        if (error.code !== 10008) Logger.error('[Autodelete]', error.message);
    }), delay).unref?.();
}

module.exports = {
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
};
