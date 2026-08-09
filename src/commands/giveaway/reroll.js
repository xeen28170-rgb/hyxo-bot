'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Giveaway = require('../../models/Giveaway');
const GiveawayService = require('../../services/giveawayService');

module.exports = {
    name: 'reroll',
    category: 'giveaway',
    description: 'Rejoue le dernier giveaway du serveur',
    permissions: ['ManageMessages'],
    async run(client, message) {
        const all = await Giveaway.find({ guildId: message.guild.id, ended: true });
        const giveaway = all.sort((a, b) => (b.endedAt || b.createdAt) - (a.endedAt || a.createdAt))[0] || null;
        if (!giveaway) return message.channel.send({ embeds: [EmbedHelper.error('Aucun giveaway terminé trouvé.')] });

        const winners = await GiveawayService.reroll(client, giveaway);
        if (!winners || !winners.length) return message.channel.send({ embeds: [EmbedHelper.error('Aucun participant éligible pour le reroll.')] });

        message.channel.send({ content: `🎉 **Gagnant(s):** ${winners.map(w => `<@${w}>`).join(', ')}` });
    },
};
