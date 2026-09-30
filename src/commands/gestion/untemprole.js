'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const TempRole = require('../../models/TempRole');
const PermissionsHelper = require('../../utils/permissions');
const { canManageRankRole } = require('../../utils/privateVoice');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'untemprole',
    category: 'gestion',
    description: 'Supprime un temprôle d\'un membre avant son expiration.',
    usage: '<membre> <rôle>',
    permissions: ['ManageRoles'],
    async run(client, message, args) {
        const member = await Helpers.resolveMember(message.guild, args[0]);
        const role = Helpers.resolveRole(message.guild, args[1]);

        if (!member || !role) {
            const prefix = message.guildSettings?.prefix || client.prefix;
            return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${prefix}untemprole ${this.usage}\``)] });
        }

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        if (!await canManageRankRole(client, message.member, role, settings)) return message.channel.send({ embeds: [EmbedHelper.error('Votre rang ne permet pas de gerer ce role Owner/WL.')] });
        if (!member.roles.cache.has(role.id)) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Ce membre n'a pas le rôle **${role.name}**.`)] });
        }
        if (!PermissionsHelper.canManageRole(message.member, role) || !PermissionsHelper.canTarget(message.member, member)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Vous ne pouvez pas gérer ce rôle ou ce membre.')] });
        }
        if (!PermissionsHelper.botCanManageRole(message.guild, role)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Le rôle du bot doit être placé au-dessus du rôle temporaire.')] });
        }

        await member.roles.remove(role, `Untemprole par ${message.author.tag}`);

        const deleted = await TempRole.remove({ guildId: message.guild.id, userId: member.id, roleId: role.id });

        const note = deleted.deletedCount > 0 ? '' : '\n_Ce rôle n\'était pas enregistré comme temprôle._';

        message.channel.send({ embeds: [EmbedHelper.success(`Le rôle **${role.name}** a été retiré de **${member.user.tag}**.${note}`)] });
    },
};
