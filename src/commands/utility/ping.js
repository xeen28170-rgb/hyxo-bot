'use strict';

const { EmbedBuilder } = require('discord.js');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'ping',
    category: 'utility',
    description: 'Voir la latence du bot.',
    usage: '+ping',
    cooldown: 5,
    async run(client, message) {
        const start = Date.now();
        const msg = await message.channel.send({ embeds: [EmbedHelper.info('🏓 Pong!', '⏳ Calcul...')] });
        const latency = Date.now() - start;
        const wsLatency = client.ws.ping;

        const embed = new EmbedBuilder()
            .setColor(latency < 100 ? 0x57F287 : latency < 250 ? 0xFEE75C : 0xED4245)
            .setTitle('🏓 Pong!')
            .addFields(
                { name: '📡 Latence API', value: `\`${latency}ms\``, inline: true },
                { name: '💓 WebSocket', value: `\`${wsLatency}ms\``, inline: true },
            )
            .setTimestamp();

        await msg.edit({ embeds: [embed] });
    },
};
