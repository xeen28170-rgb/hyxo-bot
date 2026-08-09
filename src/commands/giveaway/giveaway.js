'use strict';

const GiveawayService = require('../../services/giveawayService');
const Helpers = require('../../utils/helpers');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'giveaway',
    category: 'giveaway',
    description: 'Crée un giveaway avec les paramètres spécifiés (temps et prix).',
    usage: '+giveaway <temps> <prix>',
    permissions: ['ManageMessages'],
    cooldown: 5,
    async run(client, message, args) {
        if (!args[0] || !args[1]) return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${this.usage}\``)] });

        const duration = Helpers.parseDuration(args[0]);
        if (!duration) return message.channel.send({ embeds: [EmbedHelper.error('Durée invalide (ex: 1h, 1d).')] });

        const prize = args.slice(1).join(' ');

        await GiveawayService.create(client, message.channel, {
            prize,
            duration,
            hostId: message.author.id,
            guildId: message.guild.id
        });

        if (message.deletable) message.delete().catch(() => {});
    },
};
