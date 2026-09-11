'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const TempRole = require('../../models/TempRole');
const PermissionsHelper = require('../../utils/permissions');
const { safeSetTimeout } = require('../../utils/safeTimeout');

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

        await member.roles.add(role, `TempRole — expire ${expiresAt.toISOString()}`);

        await TempRole.remove({ guildId: message.guild.id, userId: member.id, roleId: role.id });
        await TempRole.create({ guildId: message.guild.id, userId: member.id, roleId: role.id, expiresAt });

        scheduleTempRoleExpiry(client, message.guild.id, member.id, role.id, duration);

        await message.channel.send({ embeds: [EmbedHelper.success(
            `Le rôle **${role.name}** a été ajouté à **${member.user.tag}**.\n**Expire:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`
        )] });
    },
};

function scheduleTempRoleExpiry(client, guildId, userId, roleId, delayMs) {
    safeSetTimeout(async () => {
        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) return;
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member?.roles.cache.has(roleId)) {
                await member.roles.remove(roleId, 'TempRole expiré').catch(() => {});
            }
            await TempRole.remove({ guildId, userId, roleId });
        } catch (err) {
            console.error('[TempRole] Erreur expiration:', err.message);
        }
    }, delayMs);
}

module.exports.scheduleTempRoleExpiry = scheduleTempRoleExpiry;
