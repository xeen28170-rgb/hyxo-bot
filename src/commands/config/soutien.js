'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Permissions = require('../../utils/permissions');
const { isRankRole } = require('../../utils/privateVoice');
const { getGuildSettings } = require('../../utils/guildSettings');
const SupportRole = require('../../services/supportRoleService');

module.exports = {
    name: 'soutien',
    category: 'config',
    description: 'Donne automatiquement un rôle aux membres ayant un message dans leurs statuts',
    usage: '<@rôle> <message>',
    permissions: ['Administrator'],
    async run(client, message, args) {
        const settings = await getGuildSettings(client, message.guild.id);
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0] || '');
        const statusText = args.slice(1).join(' ');

        if (args[0]?.toLowerCase() === 'off') {
            await SupportRole.cleanup(message.guild, settings.config?.soutien);
            await Guild.updateOne({ guildId: message.guild.id }, { 'config.soutien': null });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Rôle de soutien désactivé.')] });
        }

        if (!role || !statusText) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${this.usage}\``)] });
        }

        if (isRankRole(role, settings) || !Permissions.isSafeSelfAssignableRole(role) || !Permissions.botCanManageRole(message.guild, role)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Ce role ne peut pas etre attribue automatiquement.')] });
        }
        await SupportRole.cleanup(message.guild, settings.config?.soutien);
        await Guild.updateOne({ guildId: message.guild.id }, {
            'config.soutien': {
                roleId: role.id,
                statusText,
            },
        });
        client.cache.invalidateGuild(message.guild.id);

        for (const presence of message.guild.presences.cache.values()) await SupportRole.onPresence(client, presence);

        message.channel.send({ embeds: [EmbedHelper.success(`Rôle **${role.name}** attribué aux membres ayant "${statusText}" dans leur statut.`)] });
    },
};
