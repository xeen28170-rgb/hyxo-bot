'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'unlock',
    category: 'moderation',
    description: 'Déverrouiller un salon.',
    usage: '+unlock [salon]',
    permissions: ['ManageChannels'],
    botPermissions: ['ManageChannels'],
    cooldown: 5,
    async run(client, message, args) {
        const channel = Helpers.resolveChannel(message.guild, args[0]) || message.channel;
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
        message.channel.send({ embeds: [EmbedHelper.success(`🔓 **${channel.name}** a été déverrouillé.`)] });
    },
};
