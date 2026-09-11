'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'badwords',
    category: 'automod',
    description: 'Gère la protection contre les mots interdits',
    usage: '<on/off> | <add/del> <mot> | list | clear',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        if (!sub)
            return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-badwords <on/off|add|del|list|clear>`')] });

        if (sub === 'on' || sub === 'off') {
            const enabled = sub === 'on';
            await Guild.updateOne({ guildId: message.guild.id }, { 'automod.badwords.enabled': enabled });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`La protection contre les mots interdits est désormais **${enabled ? 'activée ✅' : 'désactivée ❌'}**.`)] });
        }

        if (sub === 'add') {
            const mot = args.slice(1).join(' ').toLowerCase().trim();
            if (!mot) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir un mot à ajouter.')] });
            await Guild.updateOne({ guildId: message.guild.id }, { $addToSet: { 'automod.badwords.words': mot } });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Le mot **${mot}** a été ajouté à la liste des mots interdits.`)] });
        }

        if (sub === 'del') {
            const mot = args.slice(1).join(' ').toLowerCase().trim();
            if (!mot) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir un mot à retirer.')] });
            await Guild.updateOne({ guildId: message.guild.id }, { $pull: { 'automod.badwords.words': mot } });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Le mot **${mot}** a été retiré de la liste des mots interdits.`)] });
        }

        if (sub === 'list') {
            const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
            const words = settings.automod?.badwords?.words || [];
            return message.channel.send({ embeds: [EmbedHelper.info('📋 Mots interdits', words.length ? words.map(w => `\`${w}\``).join(', ') : 'Aucun mot interdit configuré.', { color: 0xFF0000 })] });
        }

        if (sub === 'clear') {
            await Guild.updateOne({ guildId: message.guild.id }, { 'automod.badwords.words': [] });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Tous les mots interdits ont été supprimés.')] });
        }

        message.channel.send({ embeds: [EmbedHelper.error('Usage: `-badwords <on/off|add|del|list|clear>`')] });
    },
};
