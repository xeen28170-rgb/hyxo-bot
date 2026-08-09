'use strict';

const Ticket = require('../../models/Ticket');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'rename',
    category: 'tickets',
    description: 'Permet de renommer un ticket',
    usage: '<nom>',
    permissions: ['ManageMessages'],
    async run(client, message, args) {
        const ticket = await Ticket.findOne({ channelId: message.channel.id, status: 'open' });
        if (!ticket) return message.channel.send({ embeds: [EmbedHelper.error('Ce salon n\'est pas un ticket ouvert.')] });

        const name = args.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
        if (!name) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir un nom valide.')] });

        await message.channel.setName(name);
        message.channel.send({ embeds: [EmbedHelper.success(`Le ticket a été renommé en **${name}**.`)] });
    },
};
