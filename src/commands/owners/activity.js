'use strict';

const { ActivityType } = require('discord.js');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'activity',
    category: 'owners',
    ownerOnly: true,
    description: 'Change l\'activité du bot',
    usage: '[playing|listen|watch|compet|stream] <message>',
    async run(client, message, args) {
        const first = args[0]?.toLowerCase();
        if (first === 'remove' || args.join(' ').trim().toLowerCase() === 'off') {
            client.user.setActivity(null);
            return message.channel.send({ embeds: [EmbedHelper.success('Activité supprimée.')] });
        }

        const modes = ['playing', 'listen', 'watch', 'compet', 'stream'];
        let type = ActivityType.Playing;
        let textArgs = args;

        if (modes.includes(first)) {
            if (first === 'listen') type = ActivityType.Listening;
            else if (first === 'watch') type = ActivityType.Watching;
            else if (first === 'compet') type = ActivityType.Competing;
            else if (first === 'stream') type = ActivityType.Streaming;
            textArgs = args.slice(1);
        }

        const text = textArgs.join(' ');
        const prefix = message.guildSettings?.prefix || client.prefix;
        if (!text) return message.channel.send({ embeds: [EmbedHelper.error(`Fournis un texte d'activité (ex: \`${prefix}activity listen de la musique\`).`)] });

        client.user.setActivity(text, { type, url: type === ActivityType.Streaming ? 'https://twitch.tv/discord' : undefined });
        message.channel.send({ embeds: [EmbedHelper.success(`Activité changée en : **${text}**`)] });
    },
};
