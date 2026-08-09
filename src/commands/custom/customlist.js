'use strict';

const CustomCommand = require('../../models/CustomCommand');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'customlist',
    category: 'custom',
    description: 'Affiche la liste des commandes custom du serveur',
    async run(client, message) {
        const cmds = await CustomCommand.find({ guildId: message.guild.id });
        if (!cmds.length) return message.channel.send({ embeds: [EmbedHelper.info('✨ Commandes Custom', 'Aucune commande personnalisée sur ce serveur.', { color: 0xFF0000 })] });

        const embed = EmbedHelper.info('✨ Commandes Custom', cmds.map((c, i) => `**${i + 1}.** \`${c.name}\` — ${c.response?.slice(0, 50)}${c.response?.length > 50 ? '...' : ''}`).join('\n'), { color: 0xFF0000 });
        message.channel.send({ embeds: [embed] });
    },
};
