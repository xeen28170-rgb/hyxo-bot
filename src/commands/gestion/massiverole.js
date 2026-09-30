'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const PermissionsHelper = require('../../utils/permissions');
const { canManageRankRole } = require('../../utils/privateVoice');
const { getGuildSettings } = require('../../utils/guildSettings');
const { mapLimit } = require('../../utils/concurrency');

module.exports = {
    name: 'massiverole',
    category: 'gestion',
    description: 'Ajoute un rôle à tous les membres du serveur ou à tout ceux ayant un certain rôle',
    usage: '[rôle à ajouter] [rôle cible]',
    permissions: ['Administrator'],
    async run(client, message, args) {
        const roleToAdd = Helpers.resolveRole(message.guild, args[0]);
        const targetRole = args[1] ? Helpers.resolveRole(message.guild, args[1]) : null;

        if (!roleToAdd) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir le rôle à ajouter.')] });
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        if (!await canManageRankRole(client, message.member, roleToAdd, settings)) return message.channel.send({ embeds: [EmbedHelper.error('Votre rang ne permet pas de gerer ce role Owner/WL.')] });
        if (args[1] && !targetRole) return message.channel.send({ embeds: [EmbedHelper.error('Role cible introuvable.')] });
        if (!PermissionsHelper.canManageRole(message.member, roleToAdd) || !PermissionsHelper.botCanManageRole(message.guild, roleToAdd)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Ce rôle est trop élevé ou ne peut pas être géré.')] });
        }

        await message.channel.send({ embeds: [EmbedHelper.info('Préparation du rôle', 'Je récupère les membres du serveur…')] });
        await message.guild.members.fetch();
        const members = targetRole ? targetRole.members : message.guild.members.cache;
        const total = members.size;

        await message.channel.send({ embeds: [EmbedHelper.info('🚀 Action en cours...', `Ajout du rôle **${roleToAdd.name}** à **${total}** membres.`)] });

        const pending = [...members.values()].filter(member => !member.roles.cache.has(roleToAdd.id));
        const results = await mapLimit(pending, (member) => member.roles.add(roleToAdd), 5);
        const count = results.filter(r => r.ok).length;
        const failed = results.length - count;

        await message.channel.send({ embeds: [EmbedHelper.success(`Role ajoute a ${count} membres. Echecs : ${failed}.`)] });
    },
};
