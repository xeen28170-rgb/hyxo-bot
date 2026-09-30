'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { linkRow } = require('../../utils/botLinks');

module.exports = {
    name: 'invite',
    aliases: ['inviter', 'links'],
    category: 'utility',
    description: 'Ajouter Xeen sur un autre serveur.',
    usage: '-invite',
    cooldown: 5,
    async run(client, message) {
        const embed = EmbedHelper.info('➕ Inviter Xeen', 'Modération, antiraid, tickets, backups, giveaways et vocaux temporaires : ajoutez Xeen à votre serveur en un clic.');
        await message.channel.send({ embeds: [embed], components: [linkRow(client)] });
    },
};
