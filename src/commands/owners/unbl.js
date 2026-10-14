'use strict';

const Blacklist = require('../../models/Blacklist');
const Helpers = require('../../utils/helpers');
const Permissions = require('../../utils/permissions');
const Embed = require('../../utils/embedBuilder');

module.exports = {
    name: 'unbl',
    category: 'owners',
    // Préfixe réservé : &bl, &unbl, &unblall (ne marche pas avec le préfixe normal).
    prefix: '&',
    ownerOnly: true,
    usage: '-unbl <ID|@mention>',
    description: 'Retire un utilisateur de la blacklist globale.',
    async run(client, message, args) {
        if (!Permissions.isBotOwner(client, message.author.id)) return;
        const userId = Helpers.resolveUserId(args[0]);
        if (!userId) return message.channel.send({ embeds: [Embed.error('Usage: -unbl <ID|@mention>')] });
        if (!await Blacklist.findOne({ userId })) return message.channel.send({ embeds: [Embed.error('Cet utilisateur ne figure pas dans la blacklist.')] });
        await Blacklist.findOneAndDelete({ userId });
        return message.channel.send({ embeds: [Embed.success(`<@${userId}> a ete retire de la blacklist. Les bannissements Discord restent inchanges.`)] });
    },
};
