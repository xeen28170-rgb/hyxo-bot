'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { EmbedBuilder } = require('discord.js');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'config',
    category: 'config',
    description: 'Configurer le bot pour ce serveur.',
    usage: '-config <option> <valeur>',
    permissions: ['Administrator'],
    cooldown: 5,
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (!sub) return sendConfigView(client, message);

        switch (sub) {
            case 'prefix':
                if (!args[1]) return message.channel.send({ embeds: [EmbedHelper.error('❌ Usage: `-config prefix <préfixe>`')] });
                if (args[1].length > 5) return message.channel.send({ embeds: [EmbedHelper.error('❌ Le préfixe ne peut pas dépasser 5 caractères.')] });
                await Guild.updateOne({ guildId: message.guild.id }, { prefix: args[1] });
                client.cache.invalidateGuild(message.guild.id);
                return message.channel.send({ embeds: [EmbedHelper.success(message.t('config.prefix_set', { prefix: args[1] }))] });

            case 'language':
            case 'langue': {
                const lang = args[1]?.toLowerCase();
                if (!['fr', 'en'].includes(lang)) return message.channel.send({ embeds: [EmbedHelper.error('❌ Langues disponibles: `fr`, `en`')] });
                await Guild.updateOne({ guildId: message.guild.id }, { language: lang });
                client.cache.invalidateGuild(message.guild.id);
                return message.channel.send({ embeds: [EmbedHelper.success(message.t('config.language_set', { language: lang.toUpperCase() }))] });
            }

            case 'muterole': {
                const muteRole = Helpers.resolveRole(message.guild, args.slice(1).join(' '));
                if (!muteRole) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_role'))] });
                await Guild.updateOne({ guildId: message.guild.id }, { 'moderation.muteRole': muteRole.id });
                client.cache.invalidateGuild(message.guild.id);
                return message.channel.send({ embeds: [EmbedHelper.success(`✅ Rôle mute configuré: ${muteRole}`)] });
            }

            case 'logs': {
                const logsCommand = client.commands.get('logs');
                if (!logsCommand) return message.channel.send({ embeds: [EmbedHelper.error('La commande logs est indisponible.')] });
                return logsCommand.run(client, message, args.slice(1));
            }

            case 'welcome':
                return handleWelcomeConfig(client, message, args.slice(1));

            case 'modrole': {
                const modRole = Helpers.resolveRole(message.guild, args.slice(1).join(' '));
                if (!modRole) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_role'))] });
                await Guild.updateOne({ guildId: message.guild.id }, { $addToSet: { modRoles: modRole.id } });
                client.cache.invalidateGuild(message.guild.id);
                return message.channel.send({ embeds: [EmbedHelper.success(`✅ Rôle modérateur ajouté: ${modRole}`)] });
            }

            case 'adminrole': {
                const adminRole = Helpers.resolveRole(message.guild, args.slice(1).join(' '));
                if (!adminRole) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_role'))] });
                await Guild.updateOne({ guildId: message.guild.id }, { $addToSet: { adminRoles: adminRole.id } });
                client.cache.invalidateGuild(message.guild.id);
                return message.channel.send({ embeds: [EmbedHelper.success(`✅ Rôle admin ajouté: ${adminRole}`)] });
            }

            case 'reset':
                await Guild.updateOne({ guildId: message.guild.id }, {
                    prefix: '-', language: 'fr',
                    modRoles: [], adminRoles: [],
                });
                client.cache.invalidateGuild(message.guild.id);
                return message.channel.send({ embeds: [EmbedHelper.success('✅ Configuration réinitialisée.')] });

            default:
                return sendConfigView(client, message);
        }
    },
};

async function sendConfigView(client, message) {
    const settings = message.guildSettings || await getGuildSettings(client, message.guild.id, { create: false });
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(message.t('config.view_title', { guild: message.guild.name }))
        .setThumbnail(message.guild.iconURL({ dynamic: true }))
        .addFields(
            { name: '⚙️ Général', value: [
                `**Préfixe:** \`${settings?.prefix || '-'}\``,
                `**Langue:** ${settings?.language?.toUpperCase() || 'FR'}`,
                `**Rôle mute:** ${settings?.moderation?.muteRole ? `<@&${settings.moderation.muteRole}>` : 'Non configuré'}`,
            ].join('\n'), inline: false },
            { name: '📋 Rôles', value: [
                `**Modérateurs:** ${(settings?.modRoles || []).map(r => `<@&${r}>`).join(', ') || 'Aucun'}`,
                `**Admins:** ${(settings?.adminRoles || []).map(r => `<@&${r}>`).join(', ') || 'Aucun'}`,
            ].join('\n'), inline: false },
            { name: '📊 Logs', value: settings?.logs?.enabled ? '✅ Activés' : '❌ Désactivés', inline: true },
            { name: '🛡️ Antiraid', value: settings?.antiraid?.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
            { name: '🤖 Automod', value: settings?.automod?.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
            { name: '🎫 Tickets', value: settings?.tickets?.enabled ? '✅ Activés' : '❌ Désactivés', inline: true },
            { name: '🎤 TempVoc', value: settings?.tempvoc?.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
        )
        .setTimestamp()
        .setFooter({ text: '-config <option> <valeur> pour modifier' });

    message.channel.send({ embeds: [embed] });
}

async function handleWelcomeConfig(client, message, args) {
    const sub = args[0]?.toLowerCase();
    switch (sub) {
        case 'channel': {
            const ch = Helpers.resolveChannel(message.guild, args[1]);
            if (!ch) return message.channel.send({ embeds: [EmbedHelper.error('❌ Salon introuvable.')] });
            await Guild.updateOne({ guildId: message.guild.id }, { 'welcome.channel': ch.id, 'welcome.enabled': true });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`✅ Salon de bienvenue: ${ch}`)] });
        }
        case 'message': {
            const msg = args.slice(1).join(' ');
            if (!msg) return message.channel.send({ embeds: [EmbedHelper.error('❌ Fournissez un message.')] });
            await Guild.updateOne({ guildId: message.guild.id }, { 'welcome.message': msg });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('✅ Message de bienvenue mis à jour.')] });
        }
        case 'off':
            await Guild.updateOne({ guildId: message.guild.id }, { 'welcome.enabled': false });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Bienvenue désactivé.')] });
        default:
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Usage: `-config welcome <channel|message|off>`')] });
    }
}
