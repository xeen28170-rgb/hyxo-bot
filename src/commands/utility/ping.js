'use strict';

const { EmbedBuilder } = require('discord.js');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getEmoji } = require('../../config/emojis');

function verdict(ms) {
    if (ms < 120) return { label: 'excellent', color: 0x3BD47E };
    if (ms < 300) return { label: 'correct', color: 0xFFD43B };
    return { label: 'lent', color: 0xFF2D4B };
}

module.exports = {
    name: 'ping',
    category: 'utility',
    description: 'Voir la latence du bot.',
    usage: '-ping',
    cooldown: 5,
    async run(client, message) {
        const start = Date.now();
        const msg = await message.channel.send({ embeds: [EmbedHelper.info('Latence', 'Mesure en cours…')] });
        const latency = Date.now() - start;
        const ws = client.ws.ping;
        const { label, color } = verdict(latency);

        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({ name: 'Latence' })
            .setTitle(`${getEmoji('PING')} ${latency} ms · ${label}`)
            .setDescription(`Connexion ${ws < 0 ? 'en cours de mesure' : `${ws} ms`} · démarré ${Helpers.discordTimestamp(Date.now() - client.uptime, 'R')}`);

        await msg.edit({ embeds: [embed] });
    },
};
