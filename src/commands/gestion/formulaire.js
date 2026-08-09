'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'formulaire',
    category: 'gestion',
    description: 'Crée un formulaire auquel les membres peuvent répondre en appuyant sur un bouton',
    usage: '[ID]',
    permissions: ['ManageMessages'],
    async run(client, message, args) {
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const logChannelId = settings.config?.formulaireLogChannel;
        const logChannel = logChannelId ? message.guild.channels.cache.get(logChannelId) : null;

        if (args[0]) {
            const targetMsg = await message.channel.messages.fetch(args[0]).catch(() => null);
            if (!targetMsg) return message.channel.send({ embeds: [EmbedHelper.error('Message introuvable avec cet ID.')] });
        }

        const embed = EmbedHelper.info('📋 Formulaire', [
            'Cliquez sur le bouton ci-dessous pour remplir le formulaire.',
            logChannel ? `\nLes réponses seront envoyées dans <#${logChannel.id}>.` : '\n⚠️ Aucun salon de log configuré (`+modmail` pour configurer).',
        ].join(''), { color: 0xFF0000 });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('formulaire_open')
                .setLabel('Remplir le formulaire')
                .setStyle(ButtonStyle.Primary),
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    },
};
