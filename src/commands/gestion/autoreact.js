'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'autoreact',
    category: 'gestion',
    description: 'Ajoute/supprime une réaction automatique dans un salon',
    usage: '<add/del/list> <salon> <émoji>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'list') {
            const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
            const reacts = settings.config?.autoreacts || [];
            if (!reacts.length) return message.channel.send({ embeds: [EmbedHelper.info('⭐ Autoreacts', 'Aucune réaction automatique configurée.', { color: 0xFF0000 })] });
            const lines = reacts.map(r => `<#${r.channelId}> → ${r.emoji}`).join('\n');
            return message.channel.send({ embeds: [EmbedHelper.info('⭐ Autoreacts', lines, { color: 0xFF0000 })] });
        }

        if (sub === 'add') {
            const channel = Helpers.resolveChannel(message.guild, args[1]);
            const emoji = args[2];
            if (!channel || !emoji) return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+autoreact add <salon> <émoji>`')] });

            const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
            const reacts = settings.config?.autoreacts || [];
            reacts.push({ channelId: channel.id, emoji });
            await Guild.updateOne({ guildId: message.guild.id }, { 'config.autoreacts': reacts });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Réaction **${emoji}** ajoutée automatiquement dans <#${channel.id}>.`)] });
        }

        if (sub === 'del') {
            const channel = Helpers.resolveChannel(message.guild, args[1]);
            const emoji = args[2];
            if (!channel) return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+autoreact del <salon> [émoji]`')] });

            const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
            let reacts = settings.config?.autoreacts || [];
            reacts = reacts.filter(r => r.channelId !== channel.id || (emoji && r.emoji !== emoji));
            await Guild.updateOne({ guildId: message.guild.id }, { 'config.autoreacts': reacts });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Réaction automatique supprimée dans <#${channel.id}>.`)] });
        }

        message.channel.send({ embeds: [EmbedHelper.info('⭐ Autoreact', '`+autoreact add <salon> <émoji>`\n`+autoreact del <salon> [émoji]`\n`+autoreact list`', { color: 0xFF0000 })] });
    },
};
