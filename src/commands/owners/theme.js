'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'theme',
    category: 'owners',
    ownerOnly: true,
    description: 'Change la couleur principale des embeds du bot (format hex)',
    usage: '<#hex>',
    async run(client, message, args) {
        const hex = args[0]?.replace('#', '');
        if (!hex || !/^[0-9A-Fa-f]{6}$/.test(hex)) {
            const current = client.embedColor || 0x5865F2;
            return message.channel.send({ embeds: [EmbedHelper.info('🎨 Thème actuel', `Couleur: \`#${current.toString(16).padStart(6, '0').toUpperCase()}\``, { color: current })] });
        }

        const color = parseInt(hex, 16);
        client.embedColor = color;
        EmbedHelper.Colors.PRIMARY = color;
        message.channel.send({ embeds: [EmbedHelper.success(`Couleur des embeds changée en **#${hex.toUpperCase()}**.`, { color })] });
    },
};
