'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const PermissionsHelper = require('../../utils/permissions');

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
        if (!PermissionsHelper.canManageRole(message.member, roleToRemove) || !PermissionsHelper.botCanManageRole(message.guild, roleToRemove)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Ce rôle est trop élevé ou ne peut pas être géré.')] });
        }

        const members = targetRole ? targetRole.members : message.guild.members.cache;
        const total = members.size;

        await message.channel.send({ embeds: [EmbedHelper.info('🚀 Action en cours...', `Retrait du rôle **${roleToRemove.name}** à **${total}** membres.`)] });

        let count = 0;
        for (const member of members.values()) {
            if (member.roles.cache.has(roleToRemove.id)) {
                await member.roles.remove(roleToRemove).catch(() => {});
                count++;
            }
        }

        message.channel.send({ embeds: [EmbedHelper.success(`✅ Terminé ! Le rôle a été retiré à **${count}** membres.`)] });
    },
};
