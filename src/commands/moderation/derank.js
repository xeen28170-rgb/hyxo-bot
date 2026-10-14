'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const PermissionsHelper = require('../../utils/permissions');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'derank',
    category: 'moderation',
    description: 'Retirer tous les rôles d\'un membre et garder/ajouter le rôle membre.',
    usage: '<utilisateur>',
    permissions: ['ManageRoles'],
    botPermissions: ['ManageRoles'],
    async run(client, message, args) {
        if (!args[0]) return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${this.usage}\``)] });

        const member = await Helpers.resolveMember(message.guild, args[0]);
        if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });
        if (!PermissionsHelper.canTarget(message.member, member)) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.higher_role'))] });

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id, { create: false });
        // Rôle remis après le derank : rôle membre configuré, sinon l'autorole d'arrivée,
        // sinon un rôle nommé « membre(s) » / « member(s) ».
        let memberRoleId = settings?.roles?.member || settings?.welcome?.autorole;

        if (!memberRoleId) {
            const memberRole = message.guild.roles.cache.find(r => /^\W*(membres?|members?)\W*$/i.test(r.name));
            if (memberRole) memberRoleId = memberRole.id;
        }

        // Rôles gardés : rôle membre, rôles donnés à l'arrivée (autorole, rôles de bienvenue),
        // rôles protégés, et tout rôle dont le nom contient « membre » / « member ».
        const protectedRoles = new Set([
            ...(settings?.moderation?.noDerank || []),
            settings?.welcome?.autorole,
            ...(settings?.welcome?.roles || []),
        ].filter(Boolean));
        const isMemberRole = role => /membre|member/i.test(role.name);
        const botMember = message.guild.members.me;
        const rolesToRemove = member.roles.cache.filter(r =>
            r.id !== message.guild.id &&
            r.id !== memberRoleId &&
            !protectedRoles.has(r.id) &&
            !isMemberRole(r) &&
            !r.managed &&
            r.position < botMember.roles.highest.position
        );

        if (!rolesToRemove.size) {
            return message.channel.send({ embeds: [EmbedHelper.error('Aucun rôle retirable trouvé pour ce membre.')] });
        }

        await member.roles.remove(rolesToRemove, `Derank par ${message.author.tag}`);

        if (memberRoleId && !member.roles.cache.has(memberRoleId)) {
            await member.roles.add(memberRoleId, 'Ajout du rôle membre suite au derank').catch(() => {});
        }

        message.channel.send({ embeds: [EmbedHelper.success(`**${rolesToRemove.size}** rôle(s) retiré(s) de **${member.user.tag}**.`)] });
    },
};
