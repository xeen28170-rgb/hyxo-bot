'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'embed',
    category: 'gestion',
    description: 'Affiche un générateur d\'embed interactif',
    permissions: ['ManageMessages'],
    async run(client, message) {
        const embed = EmbedHelper.info('🎨 Générateur d\'Embed', [
            'Utilisez les boutons ci-dessous pour construire votre embed.',
            '',
            '**Titre:** Non défini',
            '**Description:** Non définie',
            '**Couleur:** #FF0000',
            '**Image:** Aucune',
        ].join('\n'), { color: 0xFF0000 });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`embed_title:${message.author.id}`).setLabel('Titre').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`embed_desc:${message.author.id}`).setLabel('Description').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`embed_color:${message.author.id}`).setLabel('Couleur').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`embed_send:${message.author.id}`).setLabel('Envoyer').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`embed_cancel:${message.author.id}`).setLabel('Annuler').setStyle(ButtonStyle.Danger),
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
