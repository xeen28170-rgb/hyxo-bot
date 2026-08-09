'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'rolemenu',
    category: 'config',
    description: 'Affiche un menu interactif pour créer ou modifier un menu de rôles',
    usage: '[ID]',
    permissions: ['ManageRoles'],
    async run(client, message) {
        const embed = EmbedHelper.info('🎭 Menu de Rôles', 'Cliquez sur les boutons ci-dessous pour obtenir ou retirer vos rôles.', { color: 0xFF0000 });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_member').setLabel('Membre').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('role_notif').setLabel('Notifications').setStyle(ButtonStyle.Secondary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
