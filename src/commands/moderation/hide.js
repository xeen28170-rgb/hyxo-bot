'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'hide',
    category: 'moderation',
    description: 'Masquer un salon.',
    usage: '-hide [salon]',
    permissions: ['ManageChannels'],
    botPermissions: ['ManageChannels'],
    cooldown: 5,
    async run(client, message, args) {
        const channel = Helpers.resolveChannel(message.guild, args[0]) || message.channel;
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false });
        message.channel.send({ embeds: [EmbedHelper.success(message.t('moderation.hide.success', { channel: channel.name }))] });
    },
};
