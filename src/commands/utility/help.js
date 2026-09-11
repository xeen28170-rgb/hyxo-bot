'use strict';

const {
    buildHelpMenuEmbed,
    buildHelpSelectRow,
    buildHelpCommandEmbed,
} = require('../../utils/helpEmbeds');

module.exports = {
    name: 'help',
    category: 'utility',
    description: 'Afficher le menu d\'aide.',
    usage: '-help [commande]',
    async run(client, message, args) {
        const prefix = message.guildSettings?.prefix || client.prefix;

        if (args[0]) {
            const commandName = args[0].toLowerCase();
            const command = client.commands.get(commandName)
                || [...client.commands.values()].find(c => c.aliases?.includes(commandName));

            if (!command) {
                const { EmbedHelper } = require('../../utils/embedBuilder');
                return message.channel.send({ embeds: [EmbedHelper.error(`Commande \`${commandName}\` introuvable.`)] });
            }

            const embed = buildHelpCommandEmbed(client, command, prefix);
            return message.channel.send({ embeds: [embed] });
        }

        const embed = buildHelpMenuEmbed(client, prefix);
        const row = buildHelpSelectRow(client, message.author.id);
        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
