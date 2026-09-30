'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { linkRow, supportUrl } = require('../../utils/botLinks');

module.exports = {
    name: 'support',
    category: 'utility',
    description: 'Obtenir de l\'aide sur le serveur support de Xeen.',
    usage: '-support',
    cooldown: 5,
    async run(client, message) {
        const text = supportUrl()
            ? 'Une question, un bug ou une idée ? Rejoignez le serveur support de Xeen.'
            : 'Le serveur support de Xeen arrive bientôt. En attendant, contactez le propriétaire du bot.';
        await message.channel.send({ embeds: [EmbedHelper.info('💬 Support Xeen', text)], components: [linkRow(client)] });
    },
};
