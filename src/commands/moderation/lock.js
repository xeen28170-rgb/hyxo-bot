'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'lock',
    category: 'moderation',
    description: 'Verrouiller un salon.',
    usage: '-lock [salon]',
    permissions: ['ManageChannels'],
    botPermissions: ['ManageChannels'],
    cooldown: 5,
    async run(client, message, args) {
        const channel = Helpers.resolveChannel(message.guild, args[0]) || message.channel;
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        message.channel.send({ embeds: [EmbedHelper.success(`${EmbedHelper.Emoji('LOCK')} **${channel.name}** a été verrouillé.`)] });
    },
};
