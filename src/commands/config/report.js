'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'report',
    aliases: ['report settings'],
    category: 'config',
    description: 'Configure le salon de réception des reports membres',
    usage: '<set #salon | off | status>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'set') {
            const channel = Helpers.resolveChannel(message.guild, args[1]) || message.channel;
            await Guild.updateOne({ guildId: message.guild.id }, { 'config.reportChannel': channel.id });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Les reports seront envoyés dans <#${channel.id}>.`)] });
        }

        if (sub === 'off') {
            await Guild.updateOne({ guildId: message.guild.id }, { 'config.reportChannel': null });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Le système de report a été désactivé.')] });
        }

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const channelId = settings.config?.reportChannel;

        const embed = EmbedHelper.info('🚨 Configuration Reports', [
            `**Salon:** ${channelId ? `<#${channelId}>` : 'Non configuré'}`,
            '',
            '**Usage:**',
            '`+report set [#salon]` — Définir le salon de réception',
            '`+report off` — Désactiver',
        ].join('\n'), { color: 0xFF0000 });

        message.channel.send({ embeds: [embed] });
    },
};
