'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'join-settings',
    category: 'config',
    description: 'Affiche un menu interactif pour paramétrer les arrivées',
    permissions: ['ManageGuild'],
    async run(client, message) {
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const wl = settings.welcome || {};

        const embed = EmbedHelper.info('🚪 Paramètres de Bienvenue', [
            'Configurez facilement l\'accueil des membres.',
            '',
            `**Statut:** ${wl.enabled ? '✅ Activé' : '❌ Désactivé'}`,
            `**Salon:** ${wl.channel ? `<#${wl.channel}>` : 'Non défini'}`,
            `**Message texte:** ${wl.message || 'Non défini'}`,
            `**Rôle auto:** ${wl.autorole ? `<@&${wl.autorole}>` : 'Aucun'}`,
            '',
            '*Une belle carte de bienvenue avec l\'avatar du membre sera générée automatiquement !*'
        ].join('\n'), { color: 0x5865F2 });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`joinset_toggle:${message.author.id}`).setLabel(wl.enabled ? 'Désactiver' : 'Activer').setStyle(wl.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`joinset_channel:${message.author.id}`).setLabel('Définir le Salon').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`joinset_message:${message.author.id}`).setLabel('Changer le Texte').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`joinset_role:${message.author.id}`).setLabel('Rôle Auto').setStyle(ButtonStyle.Secondary)
        );

        message.channel.send({ embeds: [embed], components: [row] });
    },
};
