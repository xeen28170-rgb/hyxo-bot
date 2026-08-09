'use strict';

const {
    buildHelpMenuEmbed,
    buildHelpSelectRow,
} = require('../../utils/helpEmbeds');

module.exports = {
    name: 'help',
    category: 'utility',
    description: 'Afficher le menu d\'aide.',
    async run(client, message) {
        const embed = buildHelpMenuEmbed(client);
        const row = buildHelpSelectRow(client, message.author.id);
        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
