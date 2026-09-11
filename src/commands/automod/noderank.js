'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'noderank',
    category: 'automod',
    description: 'Définit/supprime des rôles qui ne seront plus supprimés en cas de derank',
    usage: '<add/del/list> <rôle>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        if (!sub || !['add', 'del', 'list'].includes(sub))
            return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-noderank <add/del/list> <rôle>`')] });

        if (sub === 'list') {
            const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
            const roles = settings.moderation?.noDerank || [];
            return message.channel.send({ embeds: [EmbedHelper.info('🛡️ Rôles protégés (No-Derank)', roles.length ? roles.map(id => `<@&${id}>`).join('\n') : 'Aucun rôle protégé.', { color: 0xFF0000 })] });
        }

        const role = Helpers.resolveRole(message.guild, args.slice(1).join(' '));

        if (!role)
            return message.channel.send({ embeds: [EmbedHelper.error('Rôle introuvable.')] });

        if (sub === 'add') {
            await Guild.updateOne({ guildId: message.guild.id }, { $addToSet: { 'moderation.noDerank': role.id } });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Le rôle **${role.name}** est désormais **protégé contre le derank**.`)] });
        }

        if (sub === 'del') {
            await Guild.updateOne({ guildId: message.guild.id }, { $pull: { 'moderation.noDerank': role.id } });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Le rôle **${role.name}** n'est plus protégé contre le derank.`)] });
        }
    },
};
