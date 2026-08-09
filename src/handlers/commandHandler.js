
'use strict';

const path = require('path');
const fs = require('fs-extra');
const Logger = require('../utils/logger');

const loadedCommands = new Map();

class CommandHandler {
    constructor(client) {
        this.client = client;
        this.commandsPath = path.join(process.cwd(), 'src', 'commands');
        this.loaded = 0;
        this.failed = 0;
    }

    async load() {
        this.client.commands.clear();
        this.client.aliases.clear();
        this.loaded = 0;
        this.failed = 0;

        const categories = (await fs.readdir(this.commandsPath)).sort();

        for (const category of categories) {
            const categoryPath = path.join(this.commandsPath, category);
            const stat = await fs.stat(categoryPath);
            if (!stat.isDirectory()) continue;

            const files = (await fs.readdir(categoryPath)).filter(f => f.endsWith('.js')).sort();

            for (const file of files) {
                const filePath = path.join(categoryPath, file);
                try {
                    delete require.cache[require.resolve(filePath)];
                    const command = require(filePath);

                    if (!command.name) continue;

                    command.category = command.category || category;
                    command.permissions = command.permissions || [];
                    command.ownerOnly = command.ownerOnly || false;
                    command.serverOwnerOnly = command.serverOwnerOnly || false;
                    command.usage = command.usage || '';
                    command.description = command.description || 'Aucune description';

                    const meta = { ...command };
                    delete meta.run;

                    meta._filePath = filePath;
                    meta._loaded = true;
                    meta.run = async (...args) => {
                        const full = await resolveCommand(meta._filePath);
                        return full.run(...args);
                    };

                    this.client.commands.set(command.name, meta);

                    if (command.aliases?.length) {
                        for (const alias of command.aliases) {
                            this.client.aliases.set(alias, command.name);
                        }
                    }

                    this.loaded++;
                    Logger.debug(`Commande enregistrée: ${command.name} [${category}]`);

                } catch (error) {
                    Logger.error(`Erreur chargement commande ${file}:`, {
                        message: error.message,
                        stack: error.stack,
                    });
                    this.failed++;
                }
            }
        }

        Logger.success(`${this.loaded} commandes enregistrées (paresseuses) | ${this.failed} échecs`);
    }

    async reload(commandName) {
        const command = this.client.commands.get(commandName);
        if (!command) {
            Logger.warn(`Reload: commande "${commandName}" introuvable dans le registre.`);
            return false;
        }

        const categoryPath = path.join(this.commandsPath, command.category);
        let filePath = null;

        try {
            const files = await fs.readdir(categoryPath);
            const exactMatch = files.find(f => f === `${command.name}.js`);
            if (exactMatch) {
                filePath = path.join(categoryPath, exactMatch);
            } else {
                for (const file of files.filter(f => f.endsWith('.js'))) {
                    const fp = path.join(categoryPath, file);
                    try {
                        delete require.cache[require.resolve(fp)];
                        const mod = require(fp);
                        if (mod.name === commandName) {
                            filePath = fp;
                            break;
                        }
                    } catch { continue; }
                }
            }
        } catch (err) {
            Logger.error(`Reload: impossible de lire le dossier ${command.category}:`, err);
            return false;
        }

        if (!filePath) {
            Logger.warn(`Reload: fichier source introuvable pour la commande "${commandName}" dans [${command.category}].`);
            return false;
        }

        try {
            loadedCommands.delete(filePath);
            for (const [alias, target] of this.client.aliases) {
                if (target === commandName) this.client.aliases.delete(alias);
            }

            const fresh = await resolveCommand(filePath);
            fresh.category = fresh.category || command.category;
            fresh.permissions = fresh.permissions || [];
            fresh.ownerOnly = fresh.ownerOnly || false;
            fresh.serverOwnerOnly = fresh.serverOwnerOnly || false;
            fresh.usage = fresh.usage || '';
            fresh.description = fresh.description || 'Aucune description';

            const meta = { ...fresh };
            delete meta.run;
            meta._filePath = filePath;
            meta._loaded = true;
            meta.run = async (...args) => {
                const full = await resolveCommand(meta._filePath);
                return full.run(...args);
            };

            this.client.commands.set(fresh.name, meta);

            if (fresh.aliases?.length) {
                for (const alias of fresh.aliases) {
                    this.client.aliases.set(alias, fresh.name);
                }
            }

            Logger.success(`Commande "${commandName}" rechargée depuis ${path.basename(filePath)}.`);
            return true;
        } catch (err) {
            Logger.error(`Reload: erreur lors du chargement de ${path.basename(filePath)}:`, err);
            return false;
        }
    }
}

async function resolveCommand(filePath) {
    if (loadedCommands.has(filePath)) {
        return loadedCommands.get(filePath);
    }
    delete require.cache[require.resolve(filePath)];
    const mod = require(filePath);
    loadedCommands.set(filePath, mod);
    return mod;
}

module.exports = CommandHandler;
