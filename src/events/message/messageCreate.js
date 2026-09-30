'use strict';

const { EmbedBuilder } = require('discord.js');
const CustomCommand = require('../../models/CustomCommand');
const AutomodService = require('../../services/automodService');
const AntiraidService = require('../../services/antiraidService');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');
const BlacklistService = require('../../services/blacklistService');
const MessageAutomation = require('../../services/messageAutomationService');
const Logger = require('../../utils/logger');
const { accessContext, commandAccess } = require('../../utils/commandAccess');
const { context, presentationMessage } = require('../../utils/commandPresentation');

module.exports = {
    name: 'messageCreate',
    async run(client, message) {
        if (await BlacklistService.isBlocked(message.author.id)) return;

        if (!message.guild) {
            if (!message.author.bot) await handleDM(client, message);
            return;
        }

        const settings = await getGuildSettings(client, message.guild.id);
        message.guildSettings = settings;
        if (message.author.bot) {
            await MessageAutomation.onMessage(message, settings);
            return;
        }

        const lang = settings.language || client.defaultLanguage || 'fr';
        message.t = (key, vars) => client.translate(lang, key, vars);

        // Évite même la création d'une Promise sur le chemin courant.
        if (settings.automod?.enabled) {
            const isBlocked = await AutomodService.check(client, message, settings);
            if (isBlocked) return;
        }

        const content = message.content || '';
        const couldTriggerAntiMention = settings.antiraid?.enabled
            && (message.mentions?.everyone || content.includes('@here'));
        if (couldTriggerAntiMention) {
            const antiEveryoneBlocked = await AntiraidService.handleEveryoneMention(client, message, settings);
            if (antiEveryoneBlocked) return;
        }

        // Les protections restent bloquantes, pas les réactions décoratives.
        void MessageAutomation.onMessage(message, settings).catch(error => {
            Logger.error('[MessageAutomation]', error.message);
        });
        const prefix = settings.prefix || client.prefix;
        const usedPrefix = content.startsWith('=')
            ? '='
            : (content.startsWith(prefix) ? prefix : null);
        if (!usedPrefix) return;

        const args = content.slice(usedPrefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        let command = client.commands.get(commandName);

        if (!command && args.length > 0) {
            const twoWordName = `${commandName} ${args[0].toLowerCase()}`;
            const twoWordCommand = client.commands.get(twoWordName) || client.commands.get(client.aliases.get(twoWordName));
            if (twoWordCommand) {
                command = twoWordCommand;
                args.shift();
            }
        }

        if (!command) {
            const aliasTarget = client.aliases.get(commandName);
            if (aliasTarget) command = client.commands.get(aliasTarget);
        }

        if (command) {
            const typing = setTimeout(() => {
                void message.channel.sendTyping().catch(() => {});
            }, 800);
            typing.unref?.();
            try {
                // Tout ce qui suit (accès, cooldown, confirmation, exécution) est
                // désormais dans le même try/catch : avant ce correctif, une erreur
                // levée par accessContext/commandAccess (ex: permission Discord.js
                // invalide sur une commande) sortait de ce bloc, était avalée en
                // silence par le wrapper d'événements (eventHandler.js), et
                // l'utilisateur ne recevait JAMAIS de réponse ni de message d'erreur.
                const PermissionsHelper = require('../../utils/permissions');
                const isBotOwner = PermissionsHelper.isBotOwner(client, message.author.id);
                const denial = commandAccess(command, await accessContext(client, message.member, settings, message.channelId));
                if (denial) return message.channel.send({ embeds: [EmbedHelper.error(denial)] });

                if (command.cooldown && !isBotOwner) {
                    const remaining = client.cache.checkCooldown(message.author.id, command.name);
                    if (remaining > 0) {
                        return message.channel.send({
                            embeds: [EmbedHelper.error(`⏳ Attendez encore **${(remaining / 1000).toFixed(1)}s** avant de réutiliser \`${usedPrefix}${command.name}\`.`)]
                        }).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
                    }
                    client.cache.setCooldown(message.author.id, command.name, command.cooldown * 1000);
                }

                const wrapped = presentationMessage(MessageAutomation.commandMessage(message, command, settings), command);
                await context.run({ command, prefix: usedPrefix }, () => command.run(client, wrapped, args));
            } catch (error) {
                require('../../utils/logger').error(`Erreur commande ${command.name}:`, { message: error.message, stack: error.stack });
                const LogDispatcher = require('../../utils/logDispatcher');
                const errorEmbed = EmbedHelper.error([
                    `Commande: \`${command.name}\``,
                    `Utilisateur: ${message.author} (\`${message.author.id}\`)`,
                    `Salon: ${message.channel}`,
                    `Erreur: \`${String(error.message).slice(0, 500)}\``,
                ].join('\n'));
                await message.channel.send({ content: 'Une erreur est survenue lors de l\'exécution de la commande.' }).catch(() => {});
                await LogDispatcher.errors(message.guild, errorEmbed);
            } finally {
                clearTimeout(typing);
            }
            return;
        }

        const custom = await CustomCommand.findOne({ guildId: message.guild.id, name: commandName });
        if (custom) {
            // Mentions jamais autorisées dans la réponse : un owner malveillant (ou un
            // hook compromis) pourrait utiliser l'anti-ghostping pour mentionner @everyone.
            const sendOptions = { allowedMentions: { parse: [] } };
            if (custom.embed) {
                try {
                    const embedData = JSON.parse(custom.response);
                    const embed = new EmbedBuilder(embedData);
                    return message.channel.send({ ...sendOptions, embeds: [embed] });
                } catch {
                    return message.channel.send({ ...sendOptions, content: String(custom.response).slice(0, 2000) });
                }
            }
            return message.channel.send({ ...sendOptions, content: String(custom.response).slice(0, 2000) });
        }
    }
};

async function handleDM(client, message) {
    await message.channel.send('Les messages privés ne sont pas supportés pour le moment.');
}
