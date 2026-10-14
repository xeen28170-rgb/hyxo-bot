'use strict';

const Wet = require('../../models/Wet');
const EmbedHelper = require('../../utils/embedBuilder');
const WetService = require('../../services/wetService');

module.exports = {
    name: 'unwetall',
    category: 'owners',
    prefix: '&',
    ownerOnly: true,
    proprietaireOnly: true,
    description: 'Retire tout le monde du wet et les débannit de tous les serveurs du bot.',
    async run(client, message) {
        const entries = await Wet.find();
        if (!entries.length) return message.channel.send({ embeds: [EmbedHelper.error('Personne n\'est wet.')] });
        let unbanned = 0;
        for (const entry of entries) unbanned += (await WetService.unwetUser(client, entry.userId, message.author.tag)).unbanned;
        return message.channel.send({ embeds: [EmbedHelper.success(`${entries.length} personne(s) retirée(s) du wet, ${unbanned} débannissement(s) au total.`)] });
    },
};
