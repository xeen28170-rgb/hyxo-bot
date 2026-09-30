'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const PermissionsHelper = require('../../utils/permissions');
const { canManageRankRole } = require('../../utils/privateVoice');
const { getGuildSettings } = require('../../utils/guildSettings');
const { mapLimit } = require('../../utils/concurrency');

module.exports = {
    name: 'unmassiverole',
    category: 'gestion',
    ownerOnly: false,
    description: 'Retire un rôle à tous les membres du serveur ou à tout ceux ayant un certain rôle',
    usage: '[rôle à retirer] [rôle cible]',
    permissions: ['Administrator'],
    async run(client, message, args) {
        const roleToRemove = Helpers.resolveRole(message.guild, args[0]);
        const targetRole = args[1] ? Helpers.resolveRole(message.guild, args[1]) : null;

        if (!roleToRemove) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir le rôle à retirer.')] });
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        if (!await canManageRankRole(client, message.member, roleToRemove, settings)) return message.channel.send({ embeds: [EmbedHelper.error('Votre rang ne permet pas de gerer ce role Owner/WL.')] });
        if (args[1] && !targetRole) return message.channel.send({ embeds: [EmbedHelper.error('Role cible introuvable.')] });
        if (!PermissionsHelper.canManageRole(message.member, roleToRemove) || !PermissionsHelper.botCanManageRole(message.guild, roleToRemove)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Ce rôle est trop élevé ou ne peut pas être géré.')] });
        }

        await message.channel.send({ embeds: [EmbedHelper.info('Préparation du retrait', 'Je récupère les membres du serveur…')] });
        await message.guild.members.fetch();
        const members = targetRole ? targetRole.members : message.guild.members.cache;
        const total = members.size;

        await message.channel.send({ embeds: [EmbedHelper.info('🚀 Action en cours...', `Retrait du rôle **${roleToRemove.name}** à **${total}** membres.`)] });

        const pending = [...members.values()].filter(member => member.roles.cache.has(roleToRemove.id));
        const results = await mapLimit(pending, (member) => member.roles.remove(roleToRemove), 5);
        const count = results.filter(r => r.ok).length;
        const failed = results.length - count;

        message.channel.send({ embeds: [EmbedHelper.success(`Role retire a ${count} membres. Echecs : ${failed}.`)] });
    },
};
