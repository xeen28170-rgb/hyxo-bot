'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { mapLimit } = require('../../utils/concurrency');

module.exports = {
    name: 'lockall',
    category: 'moderation',
    description: 'Ferme tous les salons du serveur',
    permissions: ['Administrator'],
    async run(client, message) {
        const channels = message.guild.channels.cache.filter(c => c.type === 0);
        await message.channel.send({ embeds: [EmbedHelper.info('🔒 Verrouillage...', `Verrouillage de **${channels.size}** salons en cours.`)] });

        await mapLimit([...channels.values()], (ch) =>
            ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {}), 5);

        message.channel.send({ embeds: [EmbedHelper.success('✅ Tous les salons ont été verrouillés.')] });
    },
};
