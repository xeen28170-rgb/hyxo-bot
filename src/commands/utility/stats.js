'use strict';

const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'stats',
    category: 'utility',
    description: 'Afficher les statistiques du bot.',
    usage: '+stats',
    cooldown: 5,
    async run(client, message) {
        const embed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setTitle('📊 Statistiques')
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: '🌐 Serveurs', value: `\`${client.guilds.cache.size}\``, inline: true },
                { name: '👥 Utilisateurs', value: `\`${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0).toLocaleString()}\``, inline: true },
                { name: '💬 Salons', value: `\`${client.channels.cache.size.toLocaleString()}\``, inline: true },
                { name: '📡 Latence API', value: `\`${client.ws.ping}ms\``, inline: true }
            )
            .setFooter({ text: `Gestions Bot v${client.version}` })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
    },
};
