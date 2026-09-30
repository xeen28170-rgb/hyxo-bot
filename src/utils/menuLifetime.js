'use strict';

const { ActionRowBuilder, ComponentType } = require('discord.js');
const Logger = require('./logger');
const MENU_TTL = 5 * 60 * 1000;
const timers = new Map();

const INTERACTIVE = new Set([ComponentType.Button, ComponentType.StringSelect, ComponentType.UserSelect,
    ComponentType.RoleSelect, ComponentType.MentionableSelect, ComponentType.ChannelSelect]);

/**
 * Désactive tous les boutons/menus. Gère aussi les panneaux V2 (conteneurs, sections) :
 * l'arborescence est conservée, seuls les éléments interactifs sont désactivés.
 */
function disabledRows(rows) {
    const disable = node => {
        if (!node || typeof node !== 'object') return node;
        const out = { ...node };
        if (INTERACTIVE.has(out.type) && !(out.type === ComponentType.Button && out.style === 5)) out.disabled = true;
        if (Array.isArray(out.components)) out.components = out.components.map(disable);
        if (out.accessory) out.accessory = disable(out.accessory);
        return out;
    };
    return rows.map(row => {
        const data = disable(typeof row.toJSON === 'function' ? row.toJSON() : row);
        return data.type === ComponentType.ActionRow ? ActionRowBuilder.from(data) : data;
    });
}

function expired(message, now = Date.now()) {
    return !message?.createdTimestamp || now - message.createdTimestamp >= MENU_TTL;
}

function expireMenu(message, duration = MENU_TTL) {
    if (!message?.id || !message.edit || timers.has(message.id)) return;
    const timer = setTimeout(async () => {
        timers.delete(message.id);
        try {
            await message.edit({ components: disabledRows(message.components || []) });
        } catch (error) {
            if (![10008, 10003, 50001, 50013].includes(error.code)) Logger.error('[Expiration menu]', error.message);
        }
    }, duration);
    timer.unref?.();
    timers.set(message.id, timer);
}

module.exports = { MENU_TTL, disabledRows, expired, expireMenu };
