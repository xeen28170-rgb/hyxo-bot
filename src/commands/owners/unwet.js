'use strict';

const Wet = require('../../models/Wet');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const WetService = require('../../services/wetService');

module.exports = {
    name: 'unwet',
    category: 'owners',
    prefix: '&',
    ownerOnly: true,
    proprietaireOnly: true,
    description: 'Retire une personne du wet et la débannit de tous les serveurs du bot.',
    usage: '<@membre/ID>',
    async run(client, message, args) {
        const userId = Helpers.resolveUserId(args[0]);
        if (!userId) return message.channel.send({ embeds: [EmbedHelper.error('Usage : `&unwet <@membre/ID>`.')] });
        if (!await Wet.findOne({ userId })) return message.channel.send({ embeds: [EmbedHelper.error('Cette personne n\'est pas wet.')] });
        const result = await WetService.unwetUser(client, userId, message.author.tag);
        return message.channel.send({
            embeds: [EmbedHelper.success(`<@${userId}> n'est plus wet. Débanni de ${result.unbanned} serveur(s)${result.failed ? `, ${result.failed} échec(s)` : ''}.`)],
            allowedMentions: { parse: [] },
        });
    },
};
