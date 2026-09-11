'use strict';

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const TempVoice = require('../models/TempVoice');

const PREFIX = 'tvc';

// ---------------------------------------------------------------------------
// Construction du panneau (embed + boutons) envoyé dans le salon vocal créé.
// ---------------------------------------------------------------------------
function buildPanelEmbed(channel, owner) {
    const e = new EmbedBuilder()
        .setColor(0x1ABC9C)
        .setTitle('🎤 Panneau de contrôle vocal')
        .setDescription(
            `**Salon :** <#${channel.id}>\n` +
            `**Propriétaire :** ${owner ? `<@${owner.id}>` : 'Inconnu'}\n\n` +
            'Utilisez les boutons ci-dessous pour gérer votre salon vocal.'
        )
        .setFooter({ text: 'Les actions sont réservées au propriétaire du vocal.' });
    return e;
}

function buildPanelRows(channelId) {
    const cid = (action) => `${PREFIX}_${channelId}_${action}`;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(cid('lock')).setLabel('🔒 Verrouiller').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(cid('unlock')).setLabel('🔓 Déverrouiller').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(cid('rename')).setLabel('✏️ Renommer').setStyle(ButtonStyle.Primary),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(cid('limit')).setLabel('👥 Limite de membres').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(cid('hide')).setLabel('🙈 Masquer').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(cid('show')).setLabel('👀 Afficher').setStyle(ButtonStyle.Secondary),
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(cid('ban')).setLabel('🚫 Interdire l\'accès').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(cid('delete')).setLabel('🗑️ Supprimer').setStyle(ButtonStyle.Danger),
    );

    return [row1, row2, row3];
}

async function sendPanel(guild, channel, member) {
    try {
        await channel.send({
            embeds: [buildPanelEmbed(channel, member)],
            components: buildPanelRows(channel.id),
        }).catch(() => {});
    } catch { /* salon vocal indisponible */ }
}

// ---------------------------------------------------------------------------
// Ownership : l'interaction n'est valable que pour le propriétaire du vocal.
// ---------------------------------------------------------------------------
async function getPanelContext(client, interaction) {
    // customId = tvc_<channelId>_<action>
    const parts = interaction.customId.split('_');
    const channelId = parts.slice(1, -1).join('_');
    const guild = interaction.guild;

    if (!guild) {
        await interaction.reply({ content: '❌ Cette action doit être utilisée sur un serveur.', flags: 64 }).catch(() => {});
        return null;
    }
    if (!channelId) {
        await interaction.reply({ content: '❌ Panneau invalide.', flags: 64 }).catch(() => {});
        return null;
    }

    const tempVoc = await TempVoice.findOne({ guildId: guild.id, channelId });
    if (!tempVoc) {
        await interaction.reply({ content: '❌ Ce salon vocal temporaire n\'existe plus.', flags: 64 }).catch(() => {});
        return null;
    }
    if (tempVoc.ownerId !== interaction.user.id) {
        await interaction.reply({ content: '❌ Ce panneau appartient au propriétaire du vocal.', flags: 64 }).catch(() => {});
        return null;
    }

    const channel = guild.channels.cache.get(channelId)
        || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        await interaction.reply({ content: '❌ Salon vocal introuvable.', flags: 64 }).catch(() => {});
        return null;
    }

    return { guild, channel, tempVoc, channelId };
}

// ---------------------------------------------------------------------------
// Routage des boutons (appelé depuis interactionCreate).
// ---------------------------------------------------------------------------
async function handleButton(client, interaction) {
    if (!interaction.customId.startsWith(`${PREFIX}_`)) return;

    const parts = interaction.customId.split('_');
    const action = parts[parts.length - 1];

    if (action === 'rename') {
        return openRenameModal(interaction);
    }
    if (action === 'limit') {
        return openLimitModal(interaction);
    }
    if (action === 'ban') {
        return openBanMenu(client, interaction);
    }

    const ctx = await getPanelContext(client, interaction);
    if (!ctx) return;
    const { channel, tempVoc, guild } = ctx;

    switch (action) {
        case 'lock': {
            await channel.permissionOverwrites.edit(guild.roles.everyone, { Connect: false });
            await TempVoice.updateOne({ _id: tempVoc._id }, { locked: true });
            return interaction.reply({ content: '🔒 Salon **verrouillé** (personne d\'autre ne peut entrer).', flags: 64 }).catch(() => {});
        }
        case 'unlock': {
            await channel.permissionOverwrites.edit(guild.roles.everyone, { Connect: null });
            await TempVoice.updateOne({ _id: tempVoc._id }, { locked: false });
            return interaction.reply({ content: '🔓 Salon **déverrouillé**.', flags: 64 }).catch(() => {});
        }
        case 'hide': {
            await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
            await TempVoice.updateOne({ _id: tempVoc._id }, { hidden: true });
            return interaction.reply({ content: '🙈 Salon **masqué**.', flags: 64 }).catch(() => {});
        }
        case 'show': {
            await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: null });
            await TempVoice.updateOne({ _id: tempVoc._id }, { hidden: false });
            return interaction.reply({ content: '👀 Salon **visible**.', flags: 64 }).catch(() => {});
        }
        case 'delete': {
            await interaction.deferUpdate().catch(() => {});
            await channel.delete('Suppression via panneau vocal').catch(() => {});
            await TempVoice.deleteOne({ channelId: channel.id });
            return;
        }
        default:
            return interaction.reply({ content: 'Action inconnue.', flags: 64 }).catch(() => {});
    }
}

// ---------------------------------------------------------------------------
// Modals : rename + limit
// ---------------------------------------------------------------------------
function openRenameModal(interaction) {
    const parts = interaction.customId.split('_');
    const channelId = parts.slice(1, -1).join('_');
    const modal = new ModalBuilder()
        .setCustomId(`${PREFIX}_${channelId}_rename_modal`)
        .setTitle('✏️ Renommer le vocal')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('name')
                    .setLabel('Nouveau nom (max 32 caractères)')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(32)
                    .setRequired(true),
            ),
        );
    return interaction.showModal(modal).catch(() => {});
}

function openLimitModal(interaction) {
    const parts = interaction.customId.split('_');
    const channelId = parts.slice(1, -1).join('_');
    const modal = new ModalBuilder()
        .setCustomId(`${PREFIX}_${channelId}_limit_modal`)
        .setTitle('👥 Limite de membres')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('limit')
                    .setLabel('Nombre maximum de personnes (0 = illimité)')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(2)
                    .setRequired(true),
            ),
        );
    return interaction.showModal(modal).catch(() => {});
}

// ---------------------------------------------------------------------------
// Menu de sélection d'un membre à « banir » du vocal (lock de son accès).
// ---------------------------------------------------------------------------
async function openBanMenu(client, interaction) {
    const parts = interaction.customId.split('_');
    const channelId = parts.slice(1, -1).join('_');
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: '❌ Serveur introuvable.', flags: 64 }).catch(() => {});

    const channel = guild.channels.cache.get(channelId)
        || await guild.channels.fetch(channelId).catch(() => null);
    const members = channel?.members ? [...channel.members.values()] : [];
    const targetable = members.filter(m => m.id !== interaction.user.id && !m.user.bot);

    if (!targetable.length) {
        return interaction.reply({ content: 'ℹ️ Aucun autre membre présent dans le vocal à interdire.', flags: 64 }).catch(() => {});
    }

    const select = new StringSelectMenuBuilder()
        .setCustomId(`${PREFIX}_${channelId}_ban_select`)
        .setPlaceholder('Choisir une personne à interdire')
        .setMinValues(1)
        .setMaxValues(targetable.length)
        .addOptions(
            targetable.slice(0, 25).map(m =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(m.user.tag)
                    .setValue(m.id)
                    .setDescription('Lui couper l\'accès au vocal'),
            ),
        );

    return interaction.reply({
        content: '🚫 Choisissez la/les personne(s) à **interdire** (perte d\'accès + déconnexion) :',
        components: [new ActionRowBuilder().addComponents(select)],
        flags: 64,
    }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Gestion des menus de sélection du panneau (ban).
// ---------------------------------------------------------------------------
async function handleSelectMenu(client, interaction) {
    if (!interaction.customId.endsWith('_ban_select')) return;

    const parts = interaction.customId.split('_');
    const channelId = parts.slice(1, parts.length - 2).join('_');
    // customId = tvc_<channelId>_ban_select -> [tvc, <channelId>, ban, select]
    const guild = interaction.guild;
    const tempVoc = await TempVoice.findOne({ guildId: guild.id, channelId });
    if (!tempVoc) {
        return interaction.update({ content: '❌ Ce salon vocal temporaire n\'existe plus.', components: [], flags: 64 }).catch(() => {});
    }
    if (tempVoc.ownerId !== interaction.user.id) {
        return interaction.reply({ content: '❌ Ce panneau appartient au propriétaire du vocal.', flags: 64 }).catch(() => {});
    }

    const channel = guild.channels.cache.get(channelId)
        || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return interaction.update({ content: '❌ Salon introuvable.', components: [] }).catch(() => {});

    const values = interaction.values || [];
    for (const userId of values) {
        await channel.permissionOverwrites.edit(userId, { Connect: false }).catch(() => {});
        await TempVoice.updateOne({ _id: tempVoc._id }, { $addToSet: { denied: userId } });
        const member = guild.members.cache.get(userId);
        if (member && member.voice.channelId === channel.id) {
            await member.voice.disconnect('Accès refusé à ce salon').catch(() => {});
        }
    }

    return interaction.update({
        content: `🚫 **${values.length}** personne(s) n'ont plus accès à ce vocal.`,
        components: [],
    }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Modals : validation rename + limit.
// ---------------------------------------------------------------------------
async function handleModal(client, interaction) {
    if (!interaction.customId.endsWith('_rename_modal') && !interaction.customId.endsWith('_limit_modal')) return;

    const parts = interaction.customId.split('_');
    const action = parts[parts.length - 2]; // rename | limit
    const channelId = parts.slice(1, -2).join('_');
    const guild = interaction.guild;
    const tempVoc = await TempVoice.findOne({ guildId: guild.id, channelId });
    if (!tempVoc) {
        return interaction.reply({ content: '❌ Ce salon vocal temporaire n\'existe plus.', flags: 64 }).catch(() => {});
    }
    if (tempVoc.ownerId !== interaction.user.id) {
        return interaction.reply({ content: '❌ Ce panneau vous appartient-il ? Vous n\'êtes pas le propriétaire.', flags: 64 }).catch(() => {});
    }

    const channel = guild.channels.cache.get(channelId)
        || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return interaction.reply({ content: '❌ Salon introuvable.', flags: 64 }).catch(() => {});

    const value = interaction.fields?.getTextInputValue(action) || '';

    if (action === 'rename') {
        const name = value.trim().slice(0, 32);
        if (!name) return interaction.reply({ content: '❌ Nom invalide.', flags: 64 }).catch(() => {});
        await channel.setName(name);
        await TempVoice.updateOne({ _id: tempVoc._id }, { name });
        return interaction.reply({ content: `✏️ Salon renommé : **${name}**`, flags: 64 }).catch(() => {});
    }

    // action === 'limit'
    const limit = parseInt(value, 10);
    if (isNaN(limit) || limit < 0 || limit > 99) {
        return interaction.reply({ content: '❌ Limite invalide (0-99).', flags: 64 }).catch(() => {});
    }
    await channel.setUserLimit(limit);
    await TempVoice.updateOne({ _id: tempVoc._id }, { limit });
    return interaction.reply({ content: `👥 Limite réglée sur **${limit === 0 ? 'illimité' : limit}** personne(s).`, flags: 64 }).catch(() => {});
}

module.exports = {
    PREFIX,
    sendPanel,
    handleButton,
    handleSelectMenu,
    handleModal,
};
