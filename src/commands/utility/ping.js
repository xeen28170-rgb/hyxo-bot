'use strict';

const { EmbedBuilder } = require('discord.js');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'ping',
    category: 'utility',
    description: 'Voir la latence du bot.',
    usage: '-ping',
    cooldown: 5,
    async run(client, message) {
        const start = Date.now();
        const msg = await message.channel.send({ embeds: [EmbedHelper.info('🏓 Pong !', 'Je mesure le temps de réponse…')] });
        const latency = Date.now() - start;
        const wsLatency = client.ws.ping;

        const embed = new EmbedBuilder()
            .setColor(latency < 100 ? EmbedHelper.Colors.SUCCESS : latency < 250 ? EmbedHelper.Colors.WARNING : EmbedHelper.Colors.ERROR)
            .setTitle('🏓 Pong !')
            .addFields(
                { name: 'Réponse', value: `**${latency} ms**`, inline: true },
                { name: 'Connexion Discord', value: wsLatency < 0 ? 'En cours de mesure' : `**${wsLatency} ms**`, inline: true },
            );

        await msg.edit({ embeds: [embed] });
    },
};
