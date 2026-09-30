'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { mapLimit } = require('../../utils/concurrency');

module.exports = {
    name: 'hideall',
    category: 'moderation',
    description: 'Cache tous les salons du serveur',
    permissions: ['Administrator'],
    botPermissions: ['ManageChannels'],
    async run(client, message) {
        const channels = message.guild.channels.cache.filter(c => c.type === 0 || c.type === 2);
        await message.channel.send({ embeds: [EmbedHelper.info('🙈 Masquage...', `Masquage de **${channels.size}** salons en cours.`)] });

        await mapLimit([...channels.values()], (ch) =>
            ch.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false }).catch(() => {}), 5);

        message.channel.send({ embeds: [EmbedHelper.success('✅ Tous les salons ont été masqués.')] });
    },
};
