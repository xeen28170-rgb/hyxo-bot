'use strict';

const Blacklist = require('../../models/Blacklist');
const Permissions = require('../../utils/permissions');
const Embed = require('../../utils/embedBuilder');

module.exports = {
    name: 'unblall',
    category: 'owners',
    ownerOnly: true,
    description: 'Vide la blacklist globale.',
    async run(client, message) {
        if (!Permissions.isBotOwner(client, message.author.id)) return;
        const entries = await Blacklist.find();
        await Blacklist.deleteMany({});
        return message.channel.send({ embeds: [Embed.success(`${entries.length} utilisateur(s) retire(s) de la blacklist. Les bannissements Discord restent inchanges.`)] });
    },
};
