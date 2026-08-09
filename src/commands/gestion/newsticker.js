'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'newsticker',
    category: 'gestion',
    description: 'Crée un nouveau sticker sur le serveur',
    usage: '[nom]',
    permissions: ['ManageEmojisAndStickers'],
    async run(client, message, args) {
        const name = args.join(' ');
        if (!name) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir un nom pour le sticker.')] });

        const attachment = message.attachments.first();
        if (!attachment) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez joindre une image pour créer le sticker.')] });

        try {
            const sticker = await message.guild.stickers.create({
                file: attachment.url,
                name: name,
                tags: 'custom',
                reason: `Créé par ${message.author.tag}`
            });
            message.channel.send({ embeds: [EmbedHelper.success(`Sticker **${sticker.name}** créé avec succès !`)] });
        } catch (err) {
            await message.channel.send({ embeds: [EmbedHelper.error(`Erreur lors de la création du sticker : ${err.message}`)] });
        }
    },
};
