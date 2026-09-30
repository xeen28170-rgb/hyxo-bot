'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const TempRole = require('../../models/TempRole');
const PermissionsHelper = require('../../utils/permissions');
const { safeSetTimeout } = require('../../utils/safeTimeout');
const { canManageRankRole } = require('../../utils/privateVoice');
const { getGuildSettings } = require('../../utils/guildSettings');
const TempRoleService = require('../../services/tempRoleService');
const { withKey } = require('../../utils/keyedQueue');

module.exports = {
    name: 'temprole',
    category: 'gestion',
    description: 'Ajoute un rôle à un membre pour la durée donnée.',
    usage: '<membre> <rôle> <durée>',
    permissions: ['ManageRoles'],
    async run(client, message, args) {
        const member = await Helpers.resolveMember(message.guild, args[0]);
        const role   = Helpers.resolveRole(message.guild, args[1]);
        const duration = Helpers.parseDuration(args[2]);

        if (!member || !role || !duration) {
            const prefix = message.guildSettings?.prefix || client.prefix;
            return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${prefix}temprole ${this.usage}\``)] });
        }

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        if (!await canManageRankRole(client, message.member, role, settings)) return message.channel.send({ embeds: [EmbedHelper.error('Votre rang ne permet pas de gerer ce role Owner/WL.')] });
        if (role.managed) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Impossible de gérer un rôle géré par une intégration.')] });
        }
        if (!PermissionsHelper.canManageRole(message.member, role)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Vous ne pouvez pas gérer un rôle égal ou supérieur au vôtre.')] });
        }
        if (!PermissionsHelper.botCanManageRole(message.guild, role)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Le rôle du bot doit être placé au-dessus du rôle temporaire.')] });
        }
        if (!PermissionsHelper.canTarget(message.member, member)) {
            return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.higher_role'))] });
        }

        const expiresAt = new Date(Date.now() + duration);

        await withKey(`temprole:${message.guild.id}:${member.id}:${role.id}`, async () => {
            await member.roles.add(role, `TempRole expire ${expiresAt.toISOString()}`);
            await TempRole.upsert({ guildId: message.guild.id, userId: member.id, roleId: role.id, expiresAt });
        });

        scheduleTempRoleExpiry(client, message.guild.id, member.id, role.id, duration);

        await message.channel.send({ embeds: [EmbedHelper.success(
            `Le rôle **${role.name}** a été ajouté à **${member.user.tag}**.\n**Expire:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`
        )] });
    },
};

function scheduleTempRoleExpiry(client, guildId, userId, roleId, delayMs) {
    safeSetTimeout(async () => {
        try {
            await TempRoleService.expire(client, { guildId, userId, roleId });
        } catch (err) {
            console.error('[TempRole] Erreur expiration:', err.message);
        }
    }, delayMs);
}

module.exports.scheduleTempRoleExpiry = scheduleTempRoleExpiry;
