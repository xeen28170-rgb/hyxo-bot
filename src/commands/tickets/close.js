'use strict';

const TicketService = require('../../services/ticketService');

module.exports = {
    name: 'close',
    aliases: ['closeticket'],
    category: 'tickets',
    helpCategory: 'tickets',
    description: 'Ferme le ticket actuel.',
    usage: '-close',
    cooldown: 5,
    async run(client, message) {
        return TicketService.closeTicketFromMessage(client, message);
    },
};
