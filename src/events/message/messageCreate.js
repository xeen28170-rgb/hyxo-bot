'use strict';

const { EmbedBuilder } = require('discord.js');
const CustomCommand = require('../../models/CustomCommand');
const AutomodService = require('../../services/automodService');
const AntiraidService = require('../../services/antiraidService');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');
const { hasCustomCommandPermission } = require('../../utils/commandPermissions');

module.exports = {
    name: 'messageCreate',
    async run(client, message) {
        if (message.author.bot) return;

        if (!message.guild) {
            await handleDM(client, message);
            return;
        }

        const settings = await getGuildSettings(client, message.guild.id);
        message.guildSettings = settings;

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
            const twoWordCommand = client.commands.get(twoWordName);
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
            const isBotOwner = client.botOwners.has(message.author.id) || client.owners?.has(message.author.id);
            const isServerOwner = message.guild.ownerId === message.author.id || settings.owners?.includes(message.author.id);
            const canBypassPublicRestrictions = isBotOwner || isServerOwner || message.member.permissions.has('ManageGuild');

            if (isCommandRestrictedInChannel(settings, message.channelId) && !canBypassPublicRestrictions) {
                return message.channel.send({
                    embeds: [EmbedHelper.error('Les commandes sont désactivées dans ce salon.')],
                });
            }

            if (command.ownerOnly && !isBotOwner) return;

            if (command.disabled && !isBotOwner) {
                return message.channel.send({
                    embeds: [EmbedHelper.error('Cette commande est actuellement désactivée sur le bot.')],
                });
            }

            if (command.serverOwnerOnly && !isServerOwner) {
                return message.channel.send({ embeds: [EmbedHelper.error('Vous devez être propriétaire du serveur pour utiliser cette commande.')] });
            }

            if (!isBotOwner) {
                const hasNativePermissions = !command.permissions?.length || message.member.permissions.has(command.permissions);
                const hasCustomPermissions = hasCustomCommandPermission(settings, message.member, command);
                if (!hasNativePermissions && !hasCustomPermissions) {
                    return message.channel.send({ embeds: [EmbedHelper.error(`Vous n'avez pas la permission \`${command.permissions.join(', ')}\` pour utiliser cette commande.`)] });
                }
            }

            if (command.botPermissions?.length && !message.guild.members.me.permissions.has(command.botPermissions)) {
                return message.channel.send({ embeds: [EmbedHelper.error(`Le bot a besoin de la permission \`${command.botPermissions.join(', ')}\` pour fonctionner.`)] });
            }

            if (command.cooldown && !isBotOwner) {
                const remaining = client.cache.checkCooldown(message.author.id, command.name);
                if (remaining > 0) {
                    return message.channel.send({
                        embeds: [EmbedHelper.error(`⏳ Attendez encore **${(remaining / 1000).toFixed(1)}s** avant de réutiliser \`${usedPrefix}${command.name}\`.`)]
                    }).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
                }
                client.cache.setCooldown(message.author.id, command.name, command.cooldown * 1000);
            }

            try {
                await command.run(client, message, args);
            } catch (error) {
                require('../../utils/logger').error(`Erreur commande ${command.name}:`, { message: error.message, stack: error.stack });
                const LogDispatcher = require('../../utils/logDispatcher');
                const errorEmbed = EmbedHelper.error([
                    `Commande: \`${command.name}\``,
                    `Utilisateur: ${message.author} (\`${message.author.id}\`)`,
                    `Salon: ${message.channel}`,
                    `Erreur: \`${String(error.message).slice(0, 500)}\``,
                ].join('\n'));
                await LogDispatcher.errors(message.guild, errorEmbed);
                message.channel.send({ content: 'Une erreur est survenue lors de l\'exécution de la commande.' }).catch(() => {});
            }
            return;
        }

        const custom = await CustomCommand.findOne({ guildId: message.guild.id, name: commandName });
        if (custom) {
            if (custom.embed) {
                try {
                    const embedData = JSON.parse(custom.response);
                    const embed = new EmbedBuilder(embedData);
                    return message.channel.send({ embeds: [embed] });
                } catch {
                    return message.channel.send(custom.response);
                }
            }
            return message.channel.send(custom.response);
        }
    }
};

async function handleDM(client, message) {
    await message.channel.send('Les messages privés ne sont pas supportés pour le moment.');
}

function isCommandRestrictedInChannel(settings, channelId) {
    const moderation = settings?.moderation;
    if (!moderation) return false;
    if (moderation.publicCommands === false) return true;
    return Array.isArray(moderation.restrictedChannels) && moderation.restrictedChannels.includes(channelId);
}
