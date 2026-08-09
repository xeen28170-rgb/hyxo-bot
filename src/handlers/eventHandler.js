
'use strict';

const path = require('path');
const fs = require('fs-extra');
const Logger = require('../utils/logger');
const { Guild } = require('discord.js');
const EmbedHelper = require('../utils/embedBuilder');
const LogDispatcher = require('../utils/logDispatcher');

class EventHandler {
    constructor(client) {
        this.client = client;
        this.eventsPath = path.join(process.cwd(), 'src', 'events');
        this.loaded = 0;
        this.failed = 0;
    }

    async load() {
        this.loaded = 0;
        this.failed = 0;
        const preservedEvents = ['raw', 'shardReady', 'shardError', 'shardDisconnect', 'shardReconnecting', 'shardResume'];
        for (const [event] of this.client.eventNames()
            .filter(e => !preservedEvents.includes(e))
            .map(e => [e])) {
            this.client.removeAllListeners(event);
        }

        const categories = (await fs.readdir(this.eventsPath)).sort();

        for (const category of categories) {
            const categoryPath = path.join(this.eventsPath, category);
            const stat = await fs.stat(categoryPath);
            if (!stat.isDirectory()) continue;

            const files = (await fs.readdir(categoryPath)).filter(f => f.endsWith('.js')).sort();

            for (const file of files) {
                const filePath = path.join(categoryPath, file);
                try {
                    delete require.cache[require.resolve(filePath)];
                    const event = require(filePath);

                    if (!event.name) {
                        Logger.warn(`Événement sans nom: ${file}`);
                        this.failed++;
                        continue;
                    }

                    const listener = (...args) => {
                        Promise.resolve(event.run(this.client, ...args)).catch(error => {
                            Logger.error(`Erreur événement ${event.name}:`, {
                                message: error.message,
                                stack: error.stack,
                            });
                            const guild = args.find(arg => arg?.guild)?.guild
                                || args.find(arg => arg instanceof Guild)
                                || args.find(arg => arg?.guildId && this.client.guilds.cache.get(arg.guildId));
                            if (guild) {
                                const embed = EmbedHelper.error([
                                    `Événement: \`${event.name}\``,
                                    `Erreur: \`${String(error.message).slice(0, 500)}\``,
                                ].join('\n'));
                                LogDispatcher.errors(guild, embed).catch(() => {});
                            }
                        });
                    };

                    if (event.once) {
                        this.client.once(event.name, listener);
                    } else {
                        this.client.on(event.name, listener);
                    }

                    this.loaded++;
                    Logger.debug(`Événement chargé: ${event.name} [${category}]`);

                } catch (error) {
                    Logger.error(`Erreur chargement événement ${file}:`, {
                        message: error.message,
                        stack: error.stack,
                    });
                    this.failed++;
                }
            }
        }

        Logger.success(`${this.loaded} événements chargés | ${this.failed} échecs`);
    }
}

module.exports = EventHandler;
