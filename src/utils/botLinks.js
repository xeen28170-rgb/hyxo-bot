'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, OAuth2Scopes, PermissionFlagsBits } = require('discord.js');

// Antiraid, backups et logs ont besoin de tout voir : on demande Administrateur.
function inviteUrl(client) {
    return client.generateInvite({
        scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
        permissions: [PermissionFlagsBits.Administrator],
    });
}

function supportUrl() {
    return process.env.SUPPORT_URL || '';
}

function linkRow(client) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Inviter Hyxo').setEmoji('➕').setURL(inviteUrl(client)),
    );
    if (supportUrl()) row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Serveur support').setEmoji('💬').setURL(supportUrl()));
    return row;
}

module.exports = { inviteUrl, supportUrl, linkRow };
