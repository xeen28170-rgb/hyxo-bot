'use strict';

module.exports = {
    name: 'ticket-manage',
    category: 'tickets',
    description: 'Gérer les tickets de support',
    usage: '<claim|rename|close> [args]',
    permissions: ['ManageChannels'],
    botPermissions: ['ManageChannels'],
    async run(client, message, args) {
        const ticketCommand = client.commands.get('ticket');
        if (!ticketCommand) throw new Error('Commande ticket indisponible');
        return ticketCommand.run(client, message, args);
    },
};
