'use strict';

const { ChannelType } = require('discord.js');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'channel',
    category: 'utility',
    description: 'Affiche les informations relatives à un salon',
    usage: '[salon]',
    async run(client, message, args) {
        const channel = Helpers.resolveChannel(message.guild, args[0]) || message.channel;

        const embed = EmbedHelper.info(`📁 Salon: ${channel.name}`, [
            `**ID:** \`${channel.id}\``,
            `**Type:** ${ChannelType[channel.type]}`,
            `**Catégorie:** ${channel.parent ? channel.parent.name : 'Aucune'}`,
            `**Position:** ${channel.position}`,
            `**Création:** ${Helpers.discordTimestamp(channel.createdAt, 'f')}`,
        ].join('\n'), { color: 0xFF0000 });

        if (channel.topic) embed.addFields({ name: 'Sujet', value: channel.topic });

        await message.channel.send({ embeds: [embed] });
    },
};
