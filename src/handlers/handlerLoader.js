
'use strict';

const Logger = require('../utils/logger');

class HandlerLoader {
    constructor(client) {
        this.client = client;
    }

    async loadAll() {
        await this.loadLanguages();
        await this.loadCommands();
        await this.loadEvents();
        Logger.success('Tous les handlers chargés avec succès');
    }

    async loadLanguages() {
        const LanguageHandler = require('./languageHandler');
        const handler = new LanguageHandler(this.client);
        await handler.load();
    }

    async loadCommands() {
        const CommandHandler = require('./commandHandler');
        const handler = new CommandHandler(this.client);
        await handler.load();
    }

    async loadEvents() {
        const EventHandler = require('./eventHandler');
        const handler = new EventHandler(this.client);
        await handler.load();
    }
}

module.exports = HandlerLoader;
