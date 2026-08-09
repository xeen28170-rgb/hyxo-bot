'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const PermissionsHelper = require('../../utils/permissions');

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
        if (!PermissionsHelper.canManageRole(message.member, roleToAdd) || !PermissionsHelper.botCanManageRole(message.guild, roleToAdd)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Ce rôle est trop élevé ou ne peut pas être géré.')] });
        }

        const members = targetRole ? targetRole.members : message.guild.members.cache;
        const total = members.size;

        await message.channel.send({ embeds: [EmbedHelper.info('🚀 Action en cours...', `Ajout du rôle **${roleToAdd.name}** à **${total}** membres.`)] });

        let count = 0;
        for (const member of members.values()) {
            if (!member.roles.cache.has(roleToAdd.id)) {
                await member.roles.add(roleToAdd).catch(() => {});
                count++;
            }
        }

        await message.channel.send({ embeds: [EmbedHelper.success(`✅ Terminé ! Le rôle a été ajouté à **${count}** membres.`)] });
    },
};
