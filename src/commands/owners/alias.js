'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'alias',
    category: 'owners',
    ownerOnly: true,
    description: 'Permet de créer des alias pour les commandes',
    usage: '<commande>',
    async run(client, message, args) {
        const cmd = args[0]?.toLowerCase();
        if (!cmd) return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+alias <commande>`')] });

        const command = client.commands.get(cmd);
        if (!command) return message.channel.send({ embeds: [EmbedHelper.error(`Commande \`${cmd}\` introuvable.`)] });

        const alias = args.slice(1).join(' ');
        if (!alias) return message.channel.send({ embeds: [EmbedHelper.info('📝 Alias', `Alias actuels pour \`${cmd}\`: ${command.aliases?.join(', ') || 'Aucun'}`, { color: 0xFF0000 })] });

        if (!command.aliases) command.aliases = [];
        command.aliases.push(alias);
        client.commands.set(alias, command);

        message.channel.send({ embeds: [EmbedHelper.success(`Alias \`${alias}\` créé pour la commande \`${cmd}\`.`)] });
    },
};
