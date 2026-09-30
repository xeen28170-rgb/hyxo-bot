'use strict';

const owner = require('./owner');

module.exports = {
    name: 'delowner',
    category: 'owners',
    description: 'Retire un Owner du serveur.',
    usage: '-delowner <ID|@mention>',
    async run(client, message, args) {
        return owner.run(client, message, ['remove', ...args]);
    },
};
