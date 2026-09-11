'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Guild = require('../../models/Guild');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'set-perm',
    category: 'config',
    description: 'Gérer les permissions du bot sur le serveur',
    usage: '<clear|del|set> [args]',
    permissions: ['Administrator'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'clear' || sub === 'clearperms') {
            await Guild.updateOne({ guildId: message.guild.id }, { permissions: {} });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Toutes les permissions personnalisées ont été supprimées.')] });
        }

        if (sub === 'del' || sub === 'delperm') {
            const permission = args[1]?.toLowerCase();
            const targetText = args.slice(2).join(' ');
            const role = Helpers.resolveRole(message.guild, targetText);
            const member = !role ? await Helpers.resolveMember(message.guild, targetText) : null;
            const targetId = role?.id || member?.id;
            if (!permission || !targetId) {
                return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-set-perm del <permission/commande> <rôle/membre>`')] });
            }
            await Guild.updateOne(
                { guildId: message.guild.id },
                { $pull: { [`permissions.${permission}`]: targetId } }
            );
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Les permissions du rôle ont été supprimées.')] });
        }

        if (sub === 'set') {
            const setPermissionCommand = client.commands.get('setperm');
            return setPermissionCommand.run(client, message, args.slice(1));
        }

        return message.channel.send({ embeds: [EmbedHelper.info('🛡️ Permissions Serveur', '`-set-perm set <perm/cmd> <rôle/membre>`\n`-set-perm del ...`\n`-set-perm clear`', { color: 0xFF0000 })] });
    },
};
