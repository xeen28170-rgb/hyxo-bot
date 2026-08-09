'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'create',
    category: 'gestion',
    description: 'Crée un émoji custom sur le serveur',
    usage: '[émoji/lien] [nom]',
    permissions: ['ManageEmojisAndStickers'],
    async run(client, message, args) {
        let url = args[0];
        let name = args[1];

        if (message.attachments.first()) {
            url = message.attachments.first().url;
            name = args[0];
        }

        if (!url || !name) return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${client.prefix}create <lien/émoji> <nom>\``)] });

        if (url.startsWith('<') && url.endsWith('>')) {
            const id = url.match(/\d{15,}/g);
            if (id) {
                const animated = url.startsWith('<a:');
                url = `https://cdn.discordapp.com/emojis/${id[0]}.${animated ? 'gif' : 'png'}`;
            }
        }

        try {
            const emoji = await message.guild.emojis.create({ attachment: url, name });
            await message.channel.send({ embeds: [EmbedHelper.success(`L'émoji ${emoji} a été créé avec succès.`)] });
        } catch {
            await message.channel.send({ embeds: [EmbedHelper.error('Impossible de créer l\'émoji. Vérifiez le lien et le format.')] });
        }
    },
};

