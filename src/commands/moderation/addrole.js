'use strict';
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const PermissionsHelper = require('../../utils/permissions');

module.exports = {
    name: 'addrole',
    category: 'moderation',
    description: 'Ajouter un rôle à un membre.',
    usage: '<utilisateur> <rôle>',
    permissions: ['ManageRoles'],
    botPermissions: ['ManageRoles'],
    cooldown: 3,
    async run(client, message, args) {
        if (!args[0] || !args[1]) return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${module.exports.usage}\``)] });

        const member = await Helpers.resolveMember(message.guild, args[0]);
        if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });

        const role = Helpers.resolveRole(message.guild, args.slice(1).join(' '));
        if (!role) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_role'))] });
        if (role.managed) return message.channel.send({ embeds: [EmbedHelper.error(message.t('moderation.addrole.managed'))] });
        if (!PermissionsHelper.canManageRole(message.member, role)) return message.channel.send({ embeds: [EmbedHelper.error('Vous ne pouvez pas gérer un rôle égal ou supérieur au vôtre.')] });
        if (!PermissionsHelper.botCanManageRole(message.guild, role)) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.bot_higher_role'))] });
        if (!PermissionsHelper.canTarget(message.member, member)) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.higher_role'))] });

        if (member.roles.cache.has(role.id)) return message.channel.send({ embeds: [EmbedHelper.error(message.t('moderation.addrole.already_has'))] });

        await member.roles.add(role, `${message.author.tag}`);
        await message.channel.send({ embeds: [EmbedHelper.success(message.t('moderation.addrole.success', { role: role.name, user: member.user.tag }))] });
    },
};
