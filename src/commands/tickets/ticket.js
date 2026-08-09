'use strict';

const Guild = require('../../models/Guild');
const Ticket = require('../../models/Ticket');
const TicketService = require('../../services/ticketService');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
    RoleSelectMenuBuilder,
} = require('discord.js');

module.exports = {
    name: 'ticket',
    category: 'tickets',
    description: 'Ouvre le panneau de gestion des tickets.',
    usage: '+ticket',
    permissions: ['ManageChannels'],
    cooldown: 5,
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        switch (sub) {
            case undefined:
                return sendTicketAdminPanel(client, message);
            case 'panel':
            case 'setup':
                return sendPanel(client, message, args.slice(1));
            case 'close':
                return closeTicket(client, message);
            case 'claim':
                return claimTicket(client, message);
            case 'add':
                return addUser(client, message, args[1]);
            case 'remove':
                return removeUser(client, message, args[1]);
            case 'rename':
                return renameTicket(client, message, args.slice(1));
            case 'transcript':
                return saveTranscript(client, message);
            case 'enable':
                return toggleTickets(client, message, true);
            case 'disable':
                return toggleTickets(client, message, false);
            case 'category':
                return setCategory(client, message, args[1]);
            case 'supportrole':
                return setSupportRole(client, message, args.slice(1));
            default:
                return sendHelp(message);
        }
    },
};

function formatChannel(channelId) {
    return channelId ? `<#${channelId}>` : 'Non configuré';
}

function buildTicketPanelEmbed(guild, settings) {
    const tickets = settings.tickets || {};
    const supportRoles = tickets.supportRole || [];

    return new EmbedBuilder()
        .setColor(EmbedHelper.Colors.TICKET)
        .setTitle('🎫 Panneau Tickets')
        .setDescription([
            `Serveur: **${guild.name}**`,
            `Système: **${tickets.enabled ? '✅ Activé' : '❌ Désactivé'}**`,
            '',
            `**Catégorie:** ${formatChannel(tickets.category)}`,
            `**Logs tickets:** ${formatChannel(tickets.logChannel || settings.logs?.ticketLogs)}`,
            `**Rôles support:** ${supportRoles.length ? supportRoles.map(roleId => `<@&${roleId}>`).join(', ') : 'Aucun'}`,
            `**Tickets max/utilisateur:** ${tickets.maxTickets || 1}`,
            `**Transcripts:** ${tickets.transcripts === false ? '❌ Non' : '✅ Oui'}`,
        ].join('\n'))
        .setFooter({ text: 'Boutons = actions rapides. Les sous-commandes restent disponibles.' })
        .setTimestamp();
}

function buildTicketPanelRows(settings) {
    const tickets = settings.tickets || {};

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_panel_toggle')
                .setLabel(tickets.enabled ? 'Désactiver Tickets' : 'Activer Tickets')
                .setStyle(tickets.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('ticket_panel_send_here')
                .setLabel('Envoyer Panel Ici')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('ticket_panel_create_category')
                .setLabel('Créer Catégorie')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('ticket_panel_refresh')
                .setLabel('Rafraîchir')
                .setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId('ticket_panel_category')
                .setPlaceholder('Choisir la catégorie des tickets')
                .setMinValues(1)
                .setMaxValues(1)
                .setChannelTypes(ChannelType.GuildCategory),
        ),
        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId('ticket_panel_log')
                .setPlaceholder('Choisir le salon de logs tickets')
                .setMinValues(1)
                .setMaxValues(1)
                .setChannelTypes(ChannelType.GuildText),
        ),
        new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId('ticket_panel_roles')
                .setPlaceholder('Choisir les rôles support')
                .setMinValues(0)
                .setMaxValues(5),
        ),
    ];
}

async function updateTicketPanel(panelMessage, message, settings) {
    await panelMessage.edit({
        embeds: [buildTicketPanelEmbed(message.guild, settings)],
        components: buildTicketPanelRows(settings),
    });
}

async function sendTicketAdminPanel(client, message) {
    const guildId = message.guild.id;
    let settings = message.guildSettings || await getGuildSettings(client, guildId);

    const panelMessage = await message.channel.send({
        embeds: [buildTicketPanelEmbed(message.guild, settings)],
        components: buildTicketPanelRows(settings),
    });

    if (!panelMessage.createMessageComponentCollector) return;
    const collector = panelMessage.createMessageComponentCollector({ time: 10 * 60 * 1000 });

    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
            await interaction.reply({
                embeds: [EmbedHelper.error('Seul l\'auteur de la commande peut utiliser ce panneau.')],
                flags: 64,
            });
            return;
        }

        const customId = interaction.customId;

        if (customId === 'ticket_panel_send_here') {
            await interaction.deferUpdate().catch(() => {});
            await Guild.updateOne({ guildId }, { 'tickets.enabled': true });
            invalidateGuildSettings(client, guildId);
            settings = await getGuildSettings(client, guildId);
            await TicketService.sendPanel(message.channel, settings);
            await updateTicketPanel(panelMessage, message, settings);
            await interaction.followUp({ embeds: [EmbedHelper.success('✅ Panneau de création de ticket envoyé ici.')], flags: 64 }).catch(() => {});
            return;
        }

        if (customId === 'ticket_panel_create_category') {
            await interaction.deferUpdate().catch(() => {});
            if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                await interaction.followUp({ embeds: [EmbedHelper.error('❌ Je n\'ai pas la permission `Gérer les salons`.')], flags: 64 }).catch(() => {});
                return;
            }

            let category = message.guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === 'Tickets');
            if (!category) {
                category = await message.guild.channels.create({
                    name: 'Tickets',
                    type: ChannelType.GuildCategory,
                    reason: `Creation auto categorie tickets par ${message.author.tag}`,
                    permissionOverwrites: [
                        { id: message.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    ],
                });
            }

            await Guild.updateOne({ guildId }, { 'tickets.enabled': true, 'tickets.category': category.id });
            invalidateGuildSettings(client, guildId);
            settings = await getGuildSettings(client, guildId);
            await updateTicketPanel(panelMessage, message, settings);
            await interaction.followUp({ embeds: [EmbedHelper.success(`✅ Catégorie tickets configurée: **${category.name}**`)], flags: 64 }).catch(() => {});
            return;
        }

        const updates = {};
        if (customId === 'ticket_panel_toggle') {
            updates['tickets.enabled'] = !settings.tickets?.enabled;
        } else if (customId === 'ticket_panel_refresh') {
            settings = await getGuildSettings(client, guildId);
            await interaction.update({
                embeds: [buildTicketPanelEmbed(message.guild, settings)],
                components: buildTicketPanelRows(settings),
            });
            return;
        } else if (customId === 'ticket_panel_category' && interaction.isChannelSelectMenu()) {
            updates['tickets.category'] = interaction.values[0];
            updates['tickets.enabled'] = true;
        } else if (customId === 'ticket_panel_log' && interaction.isChannelSelectMenu()) {
            updates['tickets.logChannel'] = interaction.values[0];
            updates['logs.ticketLogs'] = interaction.values[0];
            updates['logs.enabled'] = true;
        } else if (customId === 'ticket_panel_roles' && interaction.isRoleSelectMenu()) {
            updates['tickets.supportRole'] = interaction.values;
        }

        if (Object.keys(updates).length) {
            await Guild.updateOne({ guildId }, updates);
            invalidateGuildSettings(client, guildId);
        }

        settings = await getGuildSettings(client, guildId);
        await interaction.update({
            embeds: [buildTicketPanelEmbed(message.guild, settings)],
            components: buildTicketPanelRows(settings),
        });
    });

    collector.on('end', async () => {
        try {
            await panelMessage.edit({
                embeds: [buildTicketPanelEmbed(message.guild, await getGuildSettings(client, guildId))],
                components: [],
            });
        } catch {
            // message supprimé / inaccessible
        }
    });
}

async function sendPanel(client, message, args) {
    const settings = message.guildSettings || await getGuildSettings(client, message.guild.id, { create: false });
    if (!settings?.tickets?.enabled) {
        return message.channel.send({ embeds: [EmbedHelper.error('❌ Le système de tickets est désactivé. Utilisez `+ticket enable`')] });
    }
    const channel = Helpers.resolveChannel(message.guild, args[0]) || message.channel;
    await TicketService.sendPanel(channel, settings);
    if (channel.id !== message.channelId) message.channel.send({ embeds: [EmbedHelper.success(`✅ Panneau envoyé dans ${channel}`)] });
}

async function closeTicket(client, message) {
    return TicketService.closeTicketFromMessage(client, message);
}

async function claimTicket(client, message) {
    const ticket = await Ticket.findOne({ channelId: message.channelId, status: { $ne: 'closed' } });
    if (!ticket) return message.channel.send({ embeds: [EmbedHelper.error(message.t('tickets.not_ticket'))] });
    const settings = message.guildSettings || await getGuildSettings(client, message.guild.id, { create: false });
    if (!TicketService.isTicketStaff(settings, message.member)) {
        return message.channel.send({ embeds: [EmbedHelper.error('❌ Seul le staff peut prendre en charge ce ticket.')] });
    }
    if (ticket.claimedBy) return message.channel.send({ embeds: [EmbedHelper.error(`❌ Ticket déjà pris par <@${ticket.claimedBy}>.`)] });

    await Ticket.updateOne({ _id: ticket._id }, { claimedBy: message.author.id, status: 'claimed' });
    message.channel.send({ embeds: [EmbedHelper.success(message.t('tickets.claimed', { user: message.author.tag }))] });
}

async function addUser(client, message, userArg) {
    const ticket = await Ticket.findOne({ channelId: message.channelId, status: { $ne: 'closed' } });
    if (!ticket) return message.channel.send({ embeds: [EmbedHelper.error(message.t('tickets.not_ticket'))] });

    const member = await Helpers.resolveMember(message.guild, userArg);
    if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });

    await message.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });
    await Ticket.updateOne({ _id: ticket._id }, { $addToSet: { participants: member.id } });
    message.channel.send({ embeds: [EmbedHelper.success(message.t('tickets.added', { user: member.user.tag }))] });
}

async function removeUser(client, message, userArg) {
    const ticket = await Ticket.findOne({ channelId: message.channelId, status: { $ne: 'closed' } });
    if (!ticket) return message.channel.send({ embeds: [EmbedHelper.error(message.t('tickets.not_ticket'))] });

    const member = await Helpers.resolveMember(message.guild, userArg);
    if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });

    await message.channel.permissionOverwrites.edit(member.id, { ViewChannel: false });
    await Ticket.updateOne({ _id: ticket._id }, { $pull: { participants: member.id } });
    message.channel.send({ embeds: [EmbedHelper.success(message.t('tickets.removed', { user: member.user.tag }))] });
}

async function renameTicket(client, message, args) {
    const ticket = await Ticket.findOne({ channelId: message.channelId, status: { $ne: 'closed' } });
    if (!ticket) return message.channel.send({ embeds: [EmbedHelper.error(message.t('tickets.not_ticket'))] });

    const name = args.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
    if (!name) return message.channel.send({ embeds: [EmbedHelper.error('❌ Nom invalide.')] });

    await message.channel.setName(name);
    message.channel.send({ embeds: [EmbedHelper.success(message.t('tickets.renamed', { name }))] });
}

async function saveTranscript(client, message) {
    let createTranscript;
    try { createTranscript = require('discord-html-transcripts').createTranscript; } catch { /* ignore */ }

    if (!createTranscript) return message.channel.send({ embeds: [EmbedHelper.error('❌ Module non disponible.')] });

    await message.channel.send('⏳ Génération de la transcription...');
    try {
        const transcript = await createTranscript(message.channel, { limit: -1 });
        message.channel.send({ content: '📄 Transcription:', files: [transcript] });
    } catch {
        message.channel.send({ embeds: [EmbedHelper.error('❌ Impossible de générer la transcription.')] });
    }
}

async function toggleTickets(client, message, enable) {
    await Guild.updateOne({ guildId: message.guild.id }, { 'tickets.enabled': enable });
    client.cache.invalidateGuild(message.guild.id);
    message.channel.send({ embeds: [enable ? EmbedHelper.success('✅ Tickets activés.') : EmbedHelper.error('❌ Tickets désactivés.')] });
}

async function setCategory(client, message, arg) {
    const channel = Helpers.resolveCategory(message.guild, arg);
    if (!channel) return message.channel.send({ embeds: [EmbedHelper.error('❌ Catégorie introuvable.')] });
    await Guild.updateOne({ guildId: message.guild.id }, { 'tickets.category': channel.id });
    client.cache.invalidateGuild(message.guild.id);
    message.channel.send({ embeds: [EmbedHelper.success(`✅ Catégorie tickets: **${channel.name}**`)] });
}

async function setSupportRole(client, message, args) {
    const role = Helpers.resolveRole(message.guild, args.join(' '));
    if (!role) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_role'))] });
    await Guild.updateOne({ guildId: message.guild.id }, { $addToSet: { 'tickets.supportRole': role.id } });
    client.cache.invalidateGuild(message.guild.id);
    message.channel.send({ embeds: [EmbedHelper.success(`✅ Rôle support ajouté: ${role}`)] });
}

function sendHelp(message) {
    const embed = EmbedHelper.info('🎫 Tickets — Aide', [
        '`+ticket enable` — Activer les tickets',
        '`+ticket disable` — Désactiver les tickets',
        '`+ticket panel [#salon]` — Envoyer le panneau',
        '`+ticket close [raison]` — Fermer le ticket',
        '`+ticket claim` — Prendre en charge',
        '`+ticket add <utilisateur>` — Ajouter un utilisateur',
        '`+ticket remove <utilisateur>` — Retirer un utilisateur',
        '`+ticket rename <nom>` — Renommer le ticket',
        '`+ticket transcript` — Sauvegarder la transcription',
        '`+ticket category <catégorie>` — Définir la catégorie',
        '`+ticket supportrole <rôle>` — Ajouter un rôle support',
    ].join('\n'));
    message.channel.send({ embeds: [embed] });
}
