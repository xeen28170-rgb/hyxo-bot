'use strict';

const Logger = require('../../utils/logger');
const EmbedHelper = require('../../utils/embedBuilder');
const TicketService = require('../../services/ticketService');
const GiveawayService = require('../../services/giveawayService');
const PermissionsHelper = require('../../utils/permissions');
const Guild = require('../../models/Guild');
const { PermissionFlagsBits } = require('discord.js');
const { buildCategoryEmbedArray, HELP_CATEGORIES, buildHelpSelectRow, getCommandsForHelpCategory } = require('../../utils/helpEmbeds');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');
const TempVoicePanel = require('../../utils/tempvoicePanel');

module.exports = {
    name: 'interactionCreate',
    once: false,
    async run(client, interaction) {
        try {
            if (interaction.isButton()) {
                await handleButton(client, interaction);
            }
            if (interaction.isStringSelectMenu()) {
                await handleSelectMenu(client, interaction);
            }
            if (interaction.isModalSubmit()) {
                await handleModal(client, interaction);
            }
        } catch (error) {
            Logger.error('Erreur interaction:', { message: error.message, stack: error.stack });
            const reply = { embeds: [EmbedHelper.error('❌ Une erreur est survenue.')], components: [] };
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(reply).catch(() => interaction.followUp({ ...reply, flags: 64 }).catch(() => {}));
                } else {
                    await interaction.reply({ ...reply, flags: 64 }).catch(() => {});
                }
            } catch { /* interaction expirée */ }
        }
    },
};

async function handleButton(client, interaction) {
    const { customId } = interaction;

    if (customId.startsWith('tvc_')) {
        await TempVoicePanel.handleButton(client, interaction);
        return;
    }

    if (customId === 'ticket_create') {
        await TicketService.createTicket(client, interaction);
        return;
    }
    if (customId === 'ticket_close') {
        await TicketService.closeTicket(client, interaction);
        return;
    }
    if (customId === 'ticket_claim') {
        await TicketService.claimTicket(client, interaction);
        return;
    }
    if (customId === 'ticket_transcript') {
        await TicketService.saveTranscript(client, interaction);
        return;
    }

    if (customId.startsWith('giveaway_join_')) {
        const messageId = customId.replace('giveaway_join_', '');
        await GiveawayService.toggleParticipation(client, interaction, messageId);
        return;
    }


    if (customId.startsWith('joinset_')) {
        await handleJoinSettings(client, interaction);
        return;
    }

    if (customId.startsWith('role_')) {
        const type = customId.replace('role_', '');
        const roleName = type === 'member' ? 'Membre' : (type === 'notif' ? 'Notifications' : null);
        if (!roleName) return interaction.reply({ content: '❌ Rôle inconnu.', flags: 64 });
        const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
        if (!role) return interaction.reply({ content: `❌ Le rôle **${roleName}** n'existe pas.`, flags: 64 });
        if (!PermissionsHelper.botCanManageRole(interaction.guild, role) || !PermissionsHelper.isSafeSelfAssignableRole(role)) {
            return interaction.reply({ content: '❌ Ce rôle ne peut pas être attribué automatiquement.', flags: 64 });
        }
        const member = interaction.member;
        try {
            if (member.roles.cache.has(role.id)) {
                await member.roles.remove(role);
                await interaction.reply({ content: `✅ Rôle **${role.name}** retiré.`, flags: 64 });
            } else {
                await member.roles.add(role);
                await interaction.reply({ content: `✅ Rôle **${role.name}** ajouté.`, flags: 64 });
            }
        } catch {
            await interaction.reply({ content: '❌ Impossible de gérer ce rôle.', flags: 64 });
        }
        return;
    }

    if (customId.startsWith('embed_')) {
        await handleEmbedBuilder(client, interaction);
        return;
    }

    Logger.debug(`Bouton non géré: ${customId}`);
}

const embedSessions = new Map();

// Purge des sessions d'embed builder abandonnées (l'utilisateur ne clique jamais
// sur Envoyer/Annuler) pour éviter une fuite mémoire lente sur les gros serveurs.
const EMBED_SESSION_TTL = 15 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of embedSessions) {
        if (now - (session.lastUsed || 0) > EMBED_SESSION_TTL) embedSessions.delete(id);
    }
}, 5 * 60 * 1000).unref();

// Construit la row des boutons de l'embed builder (une seule définition, pas de doublon)
function buildEmbedBuilderRow(ownerId) {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`embed_title:${ownerId}`).setLabel('Titre').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`embed_desc:${ownerId}`).setLabel('Description').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`embed_color:${ownerId}`).setLabel('Couleur').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`embed_send:${ownerId}`).setLabel('Envoyer').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`embed_cancel:${ownerId}`).setLabel('Annuler').setStyle(ButtonStyle.Danger),
    );
}

async function handleEmbedBuilder(client, interaction) {
    const { customId, message } = interaction;
    const [actionId, encodedOwnerId] = customId.split(':');
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: '❌ Permission `Gérer les messages` requise.', flags: 64 });
    }
    if (encodedOwnerId && interaction.user.id !== encodedOwnerId) {
        return interaction.reply({ content: '❌ Ce générateur ne vous appartient pas.', flags: 64 });
    }

    const msgId = message.id;

    if (!embedSessions.has(msgId)) {
        embedSessions.set(msgId, {
            ownerId: encodedOwnerId || interaction.user.id,
            title: null,
            description: null,
            color: 0xFF0000,
            imageUrl: null,
            lastUsed: Date.now(),
        });
    }
    const session = embedSessions.get(msgId);
    session.lastUsed = Date.now();
    if (session.ownerId !== interaction.user.id) {
        return interaction.reply({ content: '❌ Ce générateur ne vous appartient pas.', flags: 64 });
    }

    if (actionId === 'embed_cancel') {
        embedSessions.delete(msgId);
        await interaction.update({ embeds: [EmbedHelper.info('❌ Annulé', 'Le générateur d\'embed a été annulé.')], components: [] });
        return;
    }

    if (actionId === 'embed_send') {
        if (!session.title && !session.description) {
            return interaction.reply({ content: '❌ Vous devez définir au moins un titre ou une description.', flags: 64 });
        }
        const { EmbedBuilder } = require('discord.js');
        const final = new EmbedBuilder().setColor(session.color || 0xFF0000);
        if (session.title) final.setTitle(session.title);
        if (session.description) final.setDescription(session.description);
        if (session.imageUrl) final.setImage(session.imageUrl);

        await message.channel.send({ embeds: [final] });
        embedSessions.delete(msgId);
        await interaction.update({ embeds: [EmbedHelper.success('✅ Embed envoyé !')], components: [] });
        return;
    }

    const fieldMap = {
        embed_title: { label: 'Titre', field: 'title' },
        embed_desc:  { label: 'Description', field: 'description' },
        embed_color: { label: 'Couleur (hex, ex: #FF0000)', field: 'color' },
        embed_image: { label: 'URL de l\'image', field: 'imageUrl' },
    };

    const fieldInfo = fieldMap[actionId];
    if (!fieldInfo) return;

    await interaction.deferUpdate().catch(() => {});

    const filter = m => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 30_000 });

    await interaction.followUp({ content: `✏️ **${fieldInfo.label}** — Envoie ta valeur dans ce salon (30 secondes) :`, flags: 64 }).catch(() => {});

    collector.on('collect', async (msg) => {
        const val = msg.content.trim();
        await msg.delete().catch(() => {});

        if (fieldInfo.field === 'color') {
            const hex = val.replace('#', '');
            const parsed = parseInt(hex, 16);
            if (isNaN(parsed)) {
                await interaction.followUp({ content: '❌ Couleur invalide. Format attendu: `#FF0000`', flags: 64 }).catch(() => {});
            } else {
                session.color = parsed;
            }
        } else {
            session[fieldInfo.field] = val;
        }

        const previewLines = [
            `**Titre:** ${session.title || 'Non défini'}`,
            `**Description:** ${session.description ? session.description.slice(0, 80) + (session.description.length > 80 ? '...' : '') : 'Non définie'}`,
            `**Couleur:** #${(session.color || 0xFF0000).toString(16).padStart(6, '0').toUpperCase()}`,
            `**Image:** ${session.imageUrl || 'Aucune'}`,
        ];

        await message.edit({
            embeds: [EmbedHelper.info('🎨 Générateur d\'Embed', previewLines.join('\n'), { color: session.color || 0xFF0000 })],
            components: [buildEmbedBuilderRow(session.ownerId)],
        }).catch(() => {});
    });

    collector.on('end', (collected) => {
        if (collected.size === 0) {
            interaction.followUp({ content: '⏰ Temps écoulé.', flags: 64 }).catch(() => {});
        }
    });
}

async function handleSelectMenu(client, interaction) {
    const { customId, values } = interaction;

    if (customId.endsWith('_ban_select')) {
        await TempVoicePanel.handleSelectMenu(client, interaction);
        return;
    }

    if (customId.startsWith('help_category_select:')) {
        const authorId = customId.split(':')[1];
        if (interaction.user.id !== authorId) {
            return interaction.reply({ content: '❌ Ce menu d\'aide ne vous est pas destiné.', flags: 64 });
        }
        await handleHelpCategory(client, interaction, values[0]);
        return;
    }

    if (customId === 'help_category_select' || customId === 'help_select') {
        return interaction.reply({ content: '❌ Ce menu d\'aide est expiré. Tapez `-help` à nouveau.', flags: 64 });
    }
}

async function handleJoinSettings(client, interaction) {
    const guild = interaction.guild;
    const [actionId, ownerId] = interaction.customId.split(':');
    const sub = actionId.replace('joinset_', '');
    if (!guild) return interaction.reply({ content: '❌ Cette action doit être utilisée sur un serveur.', flags: 64 });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ Permission `Gérer le serveur` requise.', flags: 64 });
    }
    if (ownerId && interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ Ce panneau ne vous appartient pas.', flags: 64 });
    }

    if (sub === 'toggle') {
        const settings = await getGuildSettings(client, guild.id);
        const enabled = !settings.welcome?.enabled;
        await Guild.updateOne({ guildId: guild.id }, { 'welcome.enabled': enabled });
        invalidateGuildSettings(client, guild.id);
        await interaction.reply({ content: enabled ? '✅ Messages de bienvenue activés.' : '✅ Messages de bienvenue désactivés.', flags: 64 });
        return;
    }

    if (sub === 'channel') {
        await interaction.reply({ content: '📌 Mentionnez le salon de bienvenue (ex: `#bienvenue`) :' });
        const filter = m => m.author.id === interaction.user.id && m.mentions.channels.size > 0;
        try {
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30_000, errors: ['time'] });
            const channel = collected.first().mentions.channels.first();
            await Guild.updateOne({ guildId: guild.id }, { 'welcome.channel': channel.id, 'welcome.enabled': true });
            invalidateGuildSettings(client, guild.id);
            collected.first().delete().catch(() => {});
            await interaction.followUp({ content: `✅ Le salon de bienvenue a été défini sur <#${channel.id}>.` });
        } catch {
            await interaction.followUp({ content: '⏰ Temps écoulé. Réessayez.' });
        }
        return;
    }

    if (sub === 'message') {
        await interaction.reply({ content: '✏️ Tapez le message de bienvenue.\nVariables : `{user}`, `{server}`, `{memberCount}`\n\nExemple : `Bienvenue {user} sur {server} ! Tu es le membre n°{memberCount}`' });
        const filter = m => m.author.id === interaction.user.id;
        try {
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60_000, errors: ['time'] });
            const msg = collected.first().content;
            await Guild.updateOne({ guildId: guild.id }, { 'welcome.message': msg });
            invalidateGuildSettings(client, guild.id);
            collected.first().delete().catch(() => {});
            await interaction.followUp({ content: '✅ Le message de bienvenue a été mis à jour.' });
        } catch {
            await interaction.followUp({ content: '⏰ Temps écoulé. Réessayez.' });
        }
        return;
    }

    if (sub === 'role') {
        await interaction.reply({ content: '🎭 Mentionnez le rôle à donner automatiquement aux nouveaux membres (ex: `@Membre`) ou tapez `off` pour désactiver :' });
        const filter = m => m.author.id === interaction.user.id;
        try {
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30_000, errors: ['time'] });
            const content = collected.first().content;
            collected.first().delete().catch(() => {});

            if (content.toLowerCase() === 'off') {
                await Guild.updateOne({ guildId: guild.id }, { 'welcome.autorole': null });
                invalidateGuildSettings(client, guild.id);
                await interaction.followUp({ content: '✅ Le rôle automatique a été désactivé.' });
            } else {
                const role = collected.first().mentions.roles.first() || guild.roles.cache.get(content);
                if (!role) {
                    await interaction.followUp({ content: '❌ Rôle introuvable. Réessayez.' });
                    return;
                }
                await Guild.updateOne({ guildId: guild.id }, { 'welcome.autorole': role.id });
                invalidateGuildSettings(client, guild.id);
                await interaction.followUp({ content: `✅ Le rôle automatique a été défini sur **${role.name}**.` });
            }
        } catch {
            await interaction.followUp({ content: '⏰ Temps écoulé. Réessayez.' });
        }
    }
}

async function handleModal(client, interaction) {
    const { customId } = interaction;
    if (customId.endsWith('_rename_modal') || customId.endsWith('_limit_modal')) {
        await TempVoicePanel.handleModal(client, interaction);
        return;
    }
    if (customId === 'ticket_modal') {
        await TicketService.handleTicketModal(client, interaction);
        return;
    }
    if (customId === 'prison_modal_dm' || customId === 'prison_modal_release') {
        const { handlePrisonModal } = require('../../commands/moderation/prison');
        await handlePrisonModal(client, interaction);
        return;
    }
}

async function handleHelpCategory(client, interaction, category) {
    if (!HELP_CATEGORIES[category]) {
        return interaction.reply({ content: '❌ Catégorie inconnue.', flags: 64 }).catch(() => {});
    }

    const commands = getCommandsForHelpCategory(client, category);
    if (!commands.size) {
        return interaction.reply({ content: '❌ Catégorie vide.', flags: 64 }).catch(() => {});
    }

    const settings = interaction.guild
        ? await getGuildSettings(client, interaction.guild.id, { create: false })
        : null;
    const prefix = settings?.prefix || client.prefix;

    const embeds = buildCategoryEmbedArray(commands, category, prefix, client).slice(0, 10);
    const menuOwnerId = interaction.isStringSelectMenu() && interaction.customId.startsWith('help_category_select:')
        ? interaction.customId.split(':')[1]
        : interaction.user.id;
    const row = buildHelpSelectRow(client, menuOwnerId);

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds, components: [row] }).catch(() => {});
        return;
    }

    if (interaction.message?.editable) {
        await interaction.deferUpdate().catch(() => {});
        await interaction.message.edit({ embeds, components: [row] }).catch(() => {});
        return;
    }

    await interaction.reply({ embeds, components: [row], flags: 64 }).catch(() => {});
}
