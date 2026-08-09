'use strict';

const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    EmbedBuilder, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const Ticket = require('../models/Ticket');
const LogDispatcher = require('../utils/logDispatcher');
const { getGuildSettings } = require('../utils/guildSettings');

// Chargement PARESSEUX de discord-html-transcripts.
// La v3 tire un bundle de web-components navigateur (@derockdev/discord-components-core)
// qui référence `window` et casse/bloque au chargement dans un environnement Node
// sans DOM. Le charger au niveau module bloquait donc tout le démarrage du bot
// (interactionCreate -> ticketService -> require). On ne le résout qu'à la première
// génération de transcription, une seule fois. En cas d'échec, la fonctionnalité se
// désactive proprement (les appelants gèrent déjà `createTranscript` absent).
let _transcriptResolved = false;
let _createTranscript = null;
function loadTranscriptFn() {
    if (!_transcriptResolved) {
        _transcriptResolved = true;
        try {
            _createTranscript = require('discord-html-transcripts').createTranscript;
        } catch (err) {
            const Logger = require('../utils/logger');
            Logger.warn(`[Tickets] Module de transcription indisponible, transcriptions désactivées: ${err.message}`);
            _createTranscript = null;
        }
    }
    return _createTranscript;
}

function sanitizeMessagePayload(payload) {
    if (typeof payload === 'string') return payload;
    const clean = { ...payload };
    delete clean.ephemeral;
    delete clean.flags;
    return clean;
}

function isTicketStaff(settings, member) {
    if (!member) return false;
    return (settings?.tickets?.supportRole || []).some(roleId => member.roles.cache.has(roleId))
        || member.permissions.has(PermissionFlagsBits.ManageChannels);
}

const TicketService = {
    /**
     * Envoyer le panneau de création de ticket
     */
    async sendPanel(channel, settings) {
        const embed = new EmbedBuilder()
            .setColor(parseInt((settings.tickets?.embed?.color || '#5865F2').replace('#', ''), 16))
            .setTitle(settings.tickets?.embed?.title || '🎫 Support Tickets')
            .setDescription(settings.tickets?.embed?.description || 'Cliquez sur le bouton ci-dessous pour ouvrir un ticket de support.')
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_create')
                .setLabel('📩 Créer un ticket')
                .setStyle(ButtonStyle.Primary)
        );

        return channel.send({ embeds: [embed], components: [row] });
    },

    /**
     * Créer un nouveau ticket
     */
    async createTicket(client, interaction) {
        const { guild, user } = interaction;
        await interaction.deferReply({ ephemeral: true });

        const settings = await getGuildSettings(client, guild.id, { create: false });
        if (!settings?.tickets?.enabled) {
            return interaction.editReply({ content: '❌ Le système de tickets est désactivé.' });
        }

        const activeStatus = { $ne: 'closed' };
        const existingTicket = await Ticket.findOne({ guildId: guild.id, userId: user.id, status: activeStatus });
        if (existingTicket) {
            return interaction.editReply({
                content: `❌ Vous avez déjà un ticket ouvert: <#${existingTicket.channelId}>`,
            });
        }

        const openCount = await Ticket.countDocuments({ guildId: guild.id, userId: user.id, status: activeStatus });
        if (openCount >= (settings.tickets.maxTickets || 1)) {
            return interaction.editReply({ content: `❌ Limite de tickets atteinte (${settings.tickets.maxTickets}).` });
        }

        const ticketId = await Ticket.getNextId(guild.id);

        const permissionOverwrites = [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
                id: user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            },
            {
                id: client.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
            },
        ];

        for (const roleId of (settings.tickets.supportRole || [])) {
            permissionOverwrites.push({
                id: roleId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            });
        }

        const channel = await guild.channels.create({
            name: `ticket-${ticketId}-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, ''),
            type: ChannelType.GuildText,
            parent: settings.tickets.category || null,
            permissionOverwrites,
            topic: `Ticket de ${user.tag} | ID: ${ticketId}`,
        });

        await Ticket.create({
            guildId: guild.id,
            channelId: channel.id,
            userId: user.id,
            ticketId,
            participants: [user.id],
            status: 'open',
        });

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🎫 Ticket #${ticketId}`)
            .setDescription(`Bonjour ${user}, bienvenue dans votre ticket!\n\nDécrivez votre problème et un membre du support vous répondra dès que possible.`)
            .setTimestamp()
            .setFooter({ text: `Ticket créé par ${user.tag}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('ticket_claim').setLabel('✋ Prendre en charge').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('ticket_transcript').setLabel('📄 Transcription').setStyle(ButtonStyle.Secondary)
        );

        await channel.send({ content: `${user} ${(settings.tickets.supportRole || []).map(r => `<@&${r}>`).join(' ')}`, embeds: [embed], components: [row] });

        const logEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('🎫 Nouveau Ticket')
            .addFields(
                { name: '👤 Créateur', value: `${user} (\`${user.id}\`)`, inline: true },
                { name: '🆔 ID Ticket', value: `#${ticketId}`, inline: true },
                { name: '📂 Salon', value: `${channel}`, inline: true }
            )
            .setTimestamp();
        await LogDispatcher.tickets(guild, logEmbed);

        return interaction.editReply({ content: `✅ Votre ticket a été créé: ${channel}` });
    },

    /**
     * Fermer un ticket
     */
    async closeTicket(client, interaction) {
        const ticket = await Ticket.findOne({ channelId: interaction.channelId, status: { $ne: 'closed' } });
        if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket ouvert.', ephemeral: true });

        const settings = await getGuildSettings(client, interaction.guild.id, { create: false });
        const isStaff = isTicketStaff(settings, interaction.member);

        if (!isStaff && ticket.userId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Vous n\'avez pas la permission de fermer ce ticket.', ephemeral: true });
        }

        await interaction.reply({ content: '🔒 Fermeture du ticket dans 5 secondes...' });

        const createTranscript = loadTranscriptFn();
        if (settings?.tickets?.transcripts && createTranscript) {
            try {
                const transcript = await createTranscript(interaction.channel, { limit: -1, returnBuffer: false });
                const logEmbed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle(`📄 Ticket #${ticket.ticketId} fermé`)
                    .addFields(
                        { name: '👤 Créateur', value: `<@${ticket.userId}>`, inline: true },
                        { name: '🔒 Fermé par', value: `${interaction.user}`, inline: true },
                    )
                    .setTimestamp();
                await LogDispatcher.tickets(interaction.guild, logEmbed, [transcript]);
            } catch { /* ignore */ }
        }

        await Ticket.updateOne({ _id: ticket._id }, {
            status: 'closed',
            closedBy: interaction.user.id,
            closedAt: new Date(),
        });

        setTimeout(() => interaction.channel.delete('Ticket fermé').catch(() => {}), 5000);
    },

    /**
     * Fermer un ticket depuis une commande message
     */
    async closeTicketFromMessage(client, message) {
        return this.closeTicket(client, {
            guild: message.guild,
            channel: message.channel,
            channelId: message.channelId,
            user: message.author,
            member: message.member,
            reply: payload => message.channel.send(sanitizeMessagePayload(payload)),
        });
    },

    /**
     * Prendre en charge un ticket
     */
    async claimTicket(client, interaction) {
        const ticket = await Ticket.findOne({ channelId: interaction.channelId, status: { $ne: 'closed' } });
        if (!ticket) return interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', ephemeral: true });

        const settings = await getGuildSettings(client, interaction.guild.id, { create: false });
        if (!isTicketStaff(settings, interaction.member)) {
            return interaction.reply({ content: '❌ Seul le staff peut prendre en charge ce ticket.', ephemeral: true });
        }

        if (ticket.claimedBy) {
            return interaction.reply({ content: `❌ Ce ticket est déjà pris en charge par <@${ticket.claimedBy}>.`, ephemeral: true });
        }

        await Ticket.updateOne({ _id: ticket._id }, { claimedBy: interaction.user.id, status: 'claimed' });
        await interaction.reply({ content: `✅ **${interaction.user.tag}** a pris en charge ce ticket.` });

        const logEmbed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle(`✋ Ticket #${ticket.ticketId} pris en charge`)
            .addFields(
                { name: '👤 Créateur', value: `<@${ticket.userId}>`, inline: true },
                { name: '👨‍💼 Staff', value: `${interaction.user}`, inline: true },
                { name: '📂 Salon', value: `<#${ticket.channelId}>`, inline: true }
            )
            .setTimestamp();
        await LogDispatcher.tickets(interaction.guild, logEmbed);
    },

    /**
     * Sauvegarder la transcription
     */
    async saveTranscript(client, interaction) {
        const createTranscript = loadTranscriptFn();
        if (!createTranscript) {
            return interaction.reply({ content: '❌ Module de transcription non disponible.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const transcript = await createTranscript(interaction.channel, { limit: -1 });
            await interaction.editReply({ content: '📄 Transcription générée:', files: [transcript] });
        } catch {
            await interaction.editReply({ content: '❌ Impossible de générer la transcription.' });
        }
    },

    /**
     * Gérer le modal de ticket
     */
    async handleTicketModal(client, interaction) {
        await this.createTicket(client, interaction);
    },
};

TicketService.isTicketStaff = isTicketStaff;

module.exports = TicketService;
