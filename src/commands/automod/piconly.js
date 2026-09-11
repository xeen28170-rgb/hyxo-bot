'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'piconly',
    category: 'automod',
    description: 'Définit/supprime un salon comme salon à selfie (photos uniquement)',
    usage: '<add/del> [salon]',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        if (!sub || !['add', 'del', 'list'].includes(sub))
            return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-piconly <add/del/list> [salon]`')] });

        if (sub === 'list') {
            const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
            const channels = settings.automod?.selfieChannels || [];
            return message.channel.send({ embeds: [EmbedHelper.info('📸 Salons Photos Uniquement', channels.length ? channels.map(id => `<#${id}>`).join('\n') : 'Aucun salon configuré.', { color: 0xFF0000 })] });
        }

        const channel = (args[1] && Helpers.resolveChannel(message.guild, args[1])) || message.channel;

        if (sub === 'add') {
            await Guild.updateOne({ guildId: message.guild.id }, { $addToSet: { 'automod.selfieChannels': channel.id } });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Le salon **${channel.name}** est désormais en mode **photos uniquement**.`)] });
        }

        if (sub === 'del') {
            await Guild.updateOne({ guildId: message.guild.id }, { $pull: { 'automod.selfieChannels': channel.id } });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Le salon **${channel.name}** est de nouveau normal.`)] });
        }
    },
};
