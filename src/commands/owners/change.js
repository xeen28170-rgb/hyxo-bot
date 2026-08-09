'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'change',
    category: 'owners',
    ownerOnly: true,
    description: 'Gérer les permissions des commandes',
    usage: '<commande> <permission> [valeur] | reset',
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'reset') {
            await Guild.updateMany({}, { permissions: {} });
            return message.channel.send({ embeds: [EmbedHelper.success('Permissions réinitialisées pour tous les serveurs.')] });
        }

        const cmd = sub;
        const perm = args[1]?.toLowerCase();
        const value = args.slice(2).join(' ');

        if (!cmd || !perm) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${this.usage}\``)] });
        }

        const command = client.commands.get(cmd) || client.commands.find(c => c.name === cmd || c.aliases?.includes(cmd));
        if (!command) return message.channel.send({ embeds: [EmbedHelper.error(`Commande \`${cmd}\` introuvable.`)] });

        if (value) {
            await Guild.updateMany({}, { $addToSet: { [`permissions.${perm}`]: command.name } });
            message.channel.send({ embeds: [EmbedHelper.success(`Permission \`${perm}\` définie sur la commande \`${command.name}\` avec la valeur \`${value}\`.`)] });
        } else {
            const settings = await Guild.findOne({ guildId: message.guild.id });
            const current = settings?.permissions?.[perm] || [];
            message.channel.send({ embeds: [EmbedHelper.info(`🔑 Permission \`${perm}\` pour \`${command.name}\``, current.length ? `Attribuée à: ${current.join(', ')}` : 'Aucune attribution.')] });
        }
    },
};
