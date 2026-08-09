'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'unhide',
    category: 'moderation',
    description: 'Afficher un salon.',
    usage: '+unhide [salon]',
    permissions: ['ManageChannels'],
    botPermissions: ['ManageChannels'],
    cooldown: 5,
    async run(client, message, args) {
        const channel = Helpers.resolveChannel(message.guild, args[0]) || message.channel;
        const reason = args.slice(1).join(' ') || message.t('general.no_reason');
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null });
        message.channel.send({ embeds: [EmbedHelper.success(message.t('moderation.hide.unhide_success', { channel: channel.name, reason }))] });
    },
};
