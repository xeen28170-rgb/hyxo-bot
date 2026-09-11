'use strict';

const Giveaway = require('../../models/Giveaway');
const GiveawayService = require('../../services/giveawayService');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'endgiveaway',
    aliases: ['end giveaway'],
    category: 'giveaway',
    description: 'Permet de terminer instantanément un giveaway avec l\'ID de son message',
    usage: '<ID>',
    permissions: ['ManageMessages'],
    async run(client, message, args) {
        const msgId = args[0];
        const prefix = message.guildSettings?.prefix || client.prefix;
        if (!msgId) return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${prefix}end giveaway <ID du message>\``)] });

        const giveaway = await Giveaway.findOne({ messageId: msgId, guildId: message.guild.id });
        if (!giveaway) return message.channel.send({ embeds: [EmbedHelper.error('Giveaway introuvable avec cet ID.')] });
        if (giveaway.ended) return message.channel.send({ embeds: [EmbedHelper.error('Ce giveaway est déjà terminé.')] });

        await GiveawayService.end(client, giveaway);
        await message.channel.send({ embeds: [EmbedHelper.success('Le giveaway a été terminé instantanément.')] });
    },
};
