
'use strict';

const { Collection } = require('discord.js');
const Logger = require('../utils/logger');

class CacheManager {
    constructor() {
        this.guilds = new Collection();        // Settings de serveur
        this.permissions = new Collection();   // Permissions par serveur
        this.commands = new Collection();      // Cache commandes
        this.cooldowns = new Collection();     // Cooldowns
        this.antiSpam = new Collection();      // Anti-spam
        this.antiRaid = new Collection();      // Anti-raid
        this.tempVoice = new Collection();     // Salons vocaux temporaires
        this.tickets = new Collection();       // Tickets
        this.giveaways = new Collection();     // Giveaways
        this.reminders = new Collection();     // Rappels
        this.generic = new Collection();       // Cache générique
        this.guildLoads = new Map();            // Chargements de configuration en cours
        
        this.ttl = {
            guilds: 5 * 60 * 1000,        // 5 minutes
            permissions: 10 * 60 * 1000,  // 10 minutes
            commands: 30 * 60 * 1000,     // 30 minutes
            cooldowns: 60 * 1000,          // 1 minute
            antiSpam: 30 * 1000,           // 30 secondes
            generic: 30 * 60 * 1000,       // 30 minutes
        };
    }

    get(key) {
        return this.generic.get(key);
    }

    set(key, value) {
        this.generic.set(key, value);
    }

    delete(key) {
        this.generic.delete(key);
    }

    async init() {
        setInterval(() => this.cleanup(), 60 * 1000); // Toutes les minutes
        Logger.debug('Cache Manager initialisé');
    }

    getGuild(guildId) {
        const cached = this.guilds.get(guildId);
        if (!cached) return null;
        if (Date.now() - cached.timestamp > this.ttl.guilds) {
            this.guilds.delete(guildId);
            return null;
        }
        return cached.data;
    }

    setGuild(guildId, data) {
        this.guilds.set(guildId, { data, timestamp: Date.now() });
    }

    async getGuildOrLoad(guildId, loader) {
        const cached = this.getGuild(guildId);
        if (cached) return cached;

        // Un burst de messages ne doit déclencher qu'un seul chargement par serveur.
        let pending = this.guildLoads.get(guildId);
        if (!pending) {
            pending = Promise.resolve()
                .then(loader)
                .then(data => {
                    if (data) this.setGuild(guildId, data);
                    return data;
                })
                .finally(() => this.guildLoads.delete(guildId));
            this.guildLoads.set(guildId, pending);
        }

        return pending;
    }

    invalidateGuild(guildId) {
        this.guilds.delete(guildId);
        this.permissions.delete(guildId);
    }

    checkCooldown(userId, commandName) {
        const key = `${userId}-${commandName}`;
        const data = this.cooldowns.get(key);
        if (!data) return 0;
        const remaining = data.expires - Date.now();
        return remaining > 0 ? remaining : 0;
    }

    setCooldown(userId, commandName, duration) {
        const key = `${userId}-${commandName}`;
        this.cooldowns.set(key, { expires: Date.now() + duration });
    }

    trackMessage(userId, guildId, windowMs = 5000) {
        const key = `${userId}-${guildId}`;
        const now = Date.now();
        const data = this.antiSpam.get(key) || { messages: [], warns: 0 };
        
        data.messages = data.messages.filter(timestamp => now - timestamp < windowMs);
        data.messages.push(now);
        
        this.antiSpam.set(key, data);
        return data.messages.length;
    }

    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, data] of this.cooldowns) {
            if (data.expires < now) {
                this.cooldowns.delete(key);
                cleaned++;
            }
        }

        for (const [key, data] of this.antiSpam) {
            const fresh = data.messages.filter(t => now - t < 30000);
            if (fresh.length === 0) {
                this.antiSpam.delete(key);
                cleaned++;
            } else {
                data.messages = fresh;
            }
        }

        if (cleaned > 0) {
            Logger.debug(`Cache nettoyé: ${cleaned} entrées supprimées`);
        }
    }

    stats() {
        return {
            guilds: this.guilds.size,
            permissions: this.permissions.size,
            cooldowns: this.cooldowns.size,
            antiSpam: this.antiSpam.size,
            antiRaid: this.antiRaid.size,
            tempVoice: this.tempVoice.size,
            tickets: this.tickets.size,
        };
    }
}

module.exports = CacheManager;
