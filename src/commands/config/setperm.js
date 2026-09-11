'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'setperm',
    aliases: ['set perm'],
    category: 'config',
    description: 'Donne l\'accès à un niveau de permission ou à une commande à un rôle ou un membre',
    usage: '<permission/commande> <rôle/membre>',
    permissions: ['Administrator'],
    async run(client, message, args) {
        const perm = args[0]?.toLowerCase();
        const target = args.slice(1).join(' ');

        if (!perm || !target) return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-set perm <permission/commande> <rôle/membre>`')] });

        const role = Helpers.resolveRole(message.guild, target);
        const member = !role ? await Helpers.resolveMember(message.guild, target) : null;

        if (!role && !member) return message.channel.send({ embeds: [EmbedHelper.error('Rôle ou membre introuvable.')] });

        const targetName = role ? role.name : member.user.tag;
        const targetId = role ? role.id : member.id;
        const targetType = role ? 'rôle' : 'membre';
        const permissionKey = perm.toLowerCase();

        await Guild.updateOne(
            { guildId: message.guild.id },
            { $addToSet: { [`permissions.${permissionKey}`]: targetId } },
            { upsert: true }
        );
        client.cache.invalidateGuild(message.guild.id);

        message.channel.send({ embeds: [EmbedHelper.success(`La permission **${perm}** a été accordée au ${targetType} **${targetName}**.`)] });
    },
};
