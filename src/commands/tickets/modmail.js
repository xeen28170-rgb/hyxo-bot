'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'modmail',
    category: 'tickets',
    description: 'Configure le salon de réception des modmails',
    usage: '<set #salon | off | status>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'set') {
            const channel = Helpers.resolveChannel(message.guild, args[1]) || message.channel;
            await Guild.updateOne({ guildId: message.guild.id }, { 'config.modmailChannel': channel.id });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Les modmails seront envoyés dans <#${channel.id}>.`)] });
        }

        if (sub === 'category') {
            const cat = Helpers.resolveCategory(message.guild, args.slice(1).join(' '));
            if (!cat) return message.channel.send({ embeds: [EmbedHelper.error('Catégorie introuvable.')] });
            await Guild.updateOne({ guildId: message.guild.id }, { 'config.modmailCategory': cat.id });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Catégorie modmail définie sur **${cat.name}**.`)] });
        }

        if (sub === 'off') {
            await Guild.updateOne({ guildId: message.guild.id }, { 'config.modmailChannel': null });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Le système de modmail a été désactivé.')] });
        }

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const channelId = settings.config?.modmailChannel;
        const categoryId = settings.config?.modmailCategory;

        const embed = EmbedHelper.info('📩 Configuration Modmail', [
            `**Salon:** ${channelId ? `<#${channelId}>` : 'Non configuré'}`,
            `**Catégorie tickets:** ${categoryId ? `<#${categoryId}>` : 'Non configurée'}`,
            '',
            '**Usage:**',
            '`+modmail set [#salon]` — Définir le salon de réception',
            '`+modmail category <catégorie>` — Catégorie des tickets modmail',
            '`+modmail off` — Désactiver',
        ].join('\n'), { color: 0xFF0000 });

        message.channel.send({ embeds: [embed] });
    },
};
