'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { linkRow, supportUrl } = require('../../utils/botLinks');

module.exports = {
    name: 'support',
    category: 'utility',
    description: 'Obtenir de l\'aide sur le serveur support de Hyxo.',
    usage: '-support',
    cooldown: 5,
    async run(client, message) {
        const text = supportUrl()
            ? 'Une question, un bug ou une idée ? Rejoignez le serveur support de Hyxo.'
            : 'Le serveur support de Hyxo arrive bientôt. En attendant, contactez le propriétaire du bot.';
        await message.channel.send({ embeds: [EmbedHelper.info('💬 Support Hyxo', text)], components: [linkRow(client)] });
    },
};
