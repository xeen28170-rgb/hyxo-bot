'use strict';
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const PermissionsHelper = require('../../utils/permissions');
const { canManageRankRole } = require('../../utils/privateVoice');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'delrole',
    category: 'moderation',
    description: 'Retirer un rôle à un membre.',
    usage: '<utilisateur> <rôle>',
    permissions: ['ManageRoles'],
    botPermissions: ['ManageRoles'],
    cooldown: 3,
    async run(client, message, args) {
        // Membre et rôle dans n'importe quel ordre, ou « +delrole @rôle » en réponse au message du membre.
        if (!args.length) return message.channel.send({ embeds: [EmbedHelper.error(`Usage : \`${module.exports.usage}\` (dans n'importe quel ordre, ou en réponse au message du membre)`)] });
        const { member, role } = await Helpers.resolveMemberAndRole(message, args);
        if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });
        if (!role) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_role'))] });
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        if (!await canManageRankRole(client, message.member, role, settings)) return message.channel.send({ embeds: [EmbedHelper.error('Votre rang ne permet pas de gerer ce role Owner/WL.')] });
        if (!member.roles.cache.has(role.id)) return message.channel.send({ embeds: [EmbedHelper.error(message.t('moderation.delrole.not_has'))] });
        if (!PermissionsHelper.canManageRole(message.member, role)) return message.channel.send({ embeds: [EmbedHelper.error('Vous ne pouvez pas gérer un rôle égal ou supérieur au vôtre.')] });
        if (!PermissionsHelper.botCanManageRole(message.guild, role)) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.bot_higher_role'))] });
        if (!PermissionsHelper.canTarget(message.member, member)) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.higher_role'))] });

        await member.roles.remove(role, `${message.author.tag}`);
        await message.channel.send({ embeds: [EmbedHelper.success(`Rôle <@&${role.id}> retiré à <@${member.id}>.`)], allowedMentions: { parse: [] } });
    },
};
