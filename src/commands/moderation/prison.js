'use strict';

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const PermissionsHelper = require('../../utils/permissions');
const { isWhitelisted } = require('../../utils/whitelist');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');
const PrisonService = require('../../services/prisonService');

const PANEL_COLOR = 0x2C2F33;

const DEFAULT_DM_MESSAGE = 'Vous avez été placé en prison sur **{serveur}**. Votre comportement a entraîné cette sanction.';
const DEFAULT_RELEASE_MESSAGE = 'Vous avez été libéré de prison sur **{serveur}**. Merci de respecter les règles.';

module.exports = {
    name: 'prison',
    category: 'moderation_config',
    description: 'Emprisonner un membre (-prison <membre>) ou configurer le système de prison via le panneau (-prison) / sous-commandes.',
    usage: '-prison  (panneau de config)  |  -prison <@membre|ID> [raison]  |  -prison apply  |  -prison status  |  -prison disable',
    botPermissions: ['ManageRoles', 'ManageChannels'],
    cooldown: 5,
    aliases: ['jail'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        // Mots-clés de configuration (doivent être traités AVANT la résolution
        // d'un éventuel membre nommé de la même façon).
        if (sub === 'status') return handleStatus(client, message);
        if (sub === 'disable') return handleDisable(client, message);
        if (sub === 'apply') return handleApply(client, message);
        if (sub === 'panel') return openPrisonPanel(client, message);

        // Sans argument : panneau (config via bouton Setup) — sinon on essaie
        // d'emprisonner un membre.
        if (!sub) return openPrisonPanel(client, message);

        return handleImprison(client, message, args);
    },
};

// -prison <@membre|ID> [raison] : met un membre en prison.
// Réservé aux WL et Owner (vérifié côté bot).
async function handleImprison(client, message, args) {
    if (!args[0]) {
        return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${module.exports.usage}\``)] });
    }

    const member = await Helpers.resolveMember(message.guild, args[0]);
    if (!member) return message.channel.send({ embeds: [EmbedHelper.error('❌ Membre introuvable.')] });

    const settings = message.guildSettings || (await getGuildSettings(client, message.guild.id, { create: false }));
    if (!(await canPrisonCommand(message.member, member, settings))) {
        return message.channel.send({ embeds: [EmbedHelper.error('❌ Vous devez être **WL** ou **Owner** pour utiliser cette commande.')] });
    }

    const reason = args.slice(1).join(' ') || 'Aucune raison fournie';

    const result = await PrisonService.imprison(client, message.guild, member, { reason });
    if (!result.ok) {
        const messages = {
            not_configured: '❌ Le système de prison n\'est pas configuré. Ouvrez le panneau avec `-prison` puis cliquez sur **Setup**.',
            role_missing: '❌ Le rôle de prison est introuvable sur ce serveur.',
            member_missing: '❌ Membre introuvable.',
            already_prisoner: `⛓️ ${member} est **déjà en prison**.`,
        };
        return message.channel.send({ embeds: [EmbedHelper.error(messages[result.code] || '❌ Une erreur est survenue.')] });
    }

    message.channel.send({ embeds: [EmbedHelper.success(`⛓️ ${member} a été envoyé en prison.\n**Raison :** ${reason}`)] });

    // Message automatique dans le salon cellule avec une vraie mention Discord.
    try {
        const jailChannelId = settings?.prison?.jailChannelId;
        const jailChannel = jailChannelId ? (message.guild.channels.cache.get(jailChannelId) || await message.guild.channels.fetch(jailChannelId).catch(() => null)) : null;
        if (jailChannel) {
            await jailChannel.send({
                content: `${member} alors petit pupute, on fait des bêtises ?`,
                allowedMentions: { parse: ['users'], repliedUser: false },
            });
        }
    } catch { /* salon inaccessible : ne fait pas planter */ }

    return null;
}

// WL ou Owner (Owner du serveur = couronne OU settings.owners). Bot owner inclus via PermissionsHelper.
async function canPrisonCommand(executor, target, settings) {
    if (!executor || !target) return false;
    if (PermissionsHelper.isBotOwner(executor.client, executor.id)) return true;
    if (executor.id === target.id) return false;
    if (PermissionsHelper.canTarget(executor, target) === false) return false;

    const isOwner = await PermissionsHelper.isServerOwner(executor, settings);
    if (isOwner) return true;

    const wl = settings?.antiraid?.whitelist || [];
    return isWhitelisted(executor, executor.id, wl);
}

async function openPrisonPanel(client, message) {
    const guild = message.guild;
    const guildId = guild.id;

    let settings = await getGuildSettings(client, guildId, { create: false });

    const panelMessage = await message.channel.send({
        embeds: [buildPanelEmbed(guild, settings)],
        components: buildPanelRows(guild, settings),
    });

    if (typeof panelMessage.createMessageComponentCollector !== 'function') return;

    const collector = panelMessage.createMessageComponentCollector({ time: 10 * 60 * 1000 });

    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
            await interaction.reply({ embeds: [EmbedHelper.error('Seul l\'auteur peut utiliser ce panneau.')], flags: 64 });
            return;
        }

        const customId = interaction.customId;

        try {
            if (customId === 'prison_setup' && interaction.isButton()) {
                await interaction.deferUpdate().catch(() => {});
                const lines = await runSetup(client, guild, interaction, message.author);
                await interaction.followUp({ embeds: [EmbedHelper.success(lines.join('\n'))], flags: 64 }).catch(() => {});
                settings = await getGuildSettings(client, guildId, { create: false });
                await refreshPanel(panelMessage, guild, settings);
                return;
            }

            if (customId === 'prison_dm_toggle' && interaction.isButton()) {
                await interaction.deferUpdate().catch(() => {});
                const current = settings?.prison?.notifyDM?.enabled;
                await Guild.updateOne({ guildId }, { 'prison.notifyDM.enabled': !current });
                invalidateGuildSettings(client, guildId);
                settings = await getGuildSettings(client, guildId, { create: false });
                await interaction.editReply({
                    embeds: [EmbedHelper.success(`Messages MP ${!current ? '**activés**' : '**désactivés**'} pour les placements en prison.`)],
                    flags: 64,
                }).catch(() => {});
                await refreshPanel(panelMessage, guild, settings);
                return;
            }

            if (customId === 'prison_edit_dm' && interaction.isButton()) {
                await interaction.showModal(buildModal('prison_modal_dm', '✏️ Message MP — Entrée en prison', 'message', settings?.prison?.notifyDM?.message || DEFAULT_DM_MESSAGE));
                return;
            }

            if (customId === 'prison_edit_release' && interaction.isButton()) {
                await interaction.showModal(buildModal('prison_modal_release', '✏️ Message MP — Libération', 'message', settings?.prison?.notifyDM?.releaseMessage || DEFAULT_RELEASE_MESSAGE));
                return;
            }

            if (customId === 'prison_disable' && interaction.isButton()) {
                await interaction.deferUpdate().catch(() => {});
                await Guild.updateOne({ guildId }, { 'prison.enabled': false });
                invalidateGuildSettings(client, guildId);
                settings = await getGuildSettings(client, guildId, { create: false });
                await interaction.editReply({ embeds: [EmbedHelper.success('❌ Système de prison désactivé (rôle et salons conservés).')], flags: 64 }).catch(() => {});
                await refreshPanel(panelMessage, guild, settings);
                return;
            }

            if (customId === 'prison_preview' && interaction.isButton()) {
                const dm = settings?.prison?.notifyDM || {};
                const text = (dm.message || DEFAULT_DM_MESSAGE).replace('{serveur}', guild.name);
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('📧 Aperçu du message MP (entrée)').setDescription(text).setFooter({ text: 'Ceci est un aperçu, aucun MP envoyé.' }).setTimestamp()],
                    flags: 64,
                }).catch(() => {});
                return;
            }

            await interaction.update({ embeds: [buildPanelEmbed(guild, settings)], components: buildPanelRows(guild, settings) }).catch(() => {});
        } catch (error) {
            try { await interaction.reply({ embeds: [EmbedHelper.error(`Erreur : ${error.message}`)], flags: 64 }); } catch { /* ignore */ }
        }
    });

    collector.on('end', async () => {
        try { await panelMessage.edit({ components: [] }).catch(() => {}); } catch { /* ignore */ }
    });
}

async function refreshPanel(panelMessage, guild, settings) {
    try {
        await panelMessage.edit({ embeds: [buildPanelEmbed(guild, settings)], components: buildPanelRows(guild, settings) }).catch(() => {});
    } catch { /* ignore */ }
}

function buildModal(customId, title, fieldId, value) {
    const input = new TextInputBuilder()
        .setCustomId(fieldId)
        .setLabel('Message')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(value || '')
        .setMaxLength(1500)
        .setRequired(true)
        .setPlaceholder('Placeholders : {user} = @membre, {serveur}, {duree}');
    return new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title)
        .addComponents(new ActionRowBuilder().addComponents(input));
}

async function handlePrisonModal(client, interaction) {
    const { customId } = interaction;
    const guildId = interaction.guild?.id;
    if (!guildId) return;

    const value = interaction.fields?.getTextInputValue?.('message') || '';
    const field = customId === 'prison_modal_dm' ? 'notifyDM.message' : 'notifyDM.releaseMessage';

    await Guild.updateOne({ guildId }, { [`prison.${field}`]: value });
    invalidateGuildSettings(client, guildId);

    const label = customId === 'prison_modal_dm' ? 'MP d\'entrée en prison' : 'MP de libération';
    await interaction.reply({ embeds: [EmbedHelper.success(`✅ **${label}** mis à jour.`)], flags: 64 }).catch(() => {});
}

function buildPanelEmbed(guild, settings) {
    const p = settings?.prison || {};
    const g = guild;
    const dm = p.notifyDM || {};

    return new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle('⛓️ Système de Prison')
        .setDescription([
            `Serveur : **${guild.name}**`,
            `État : **${p.enabled ? '✅ Activé' : '❌ Désactivé'}**`,
            '',
            '**Configuration :**',
            `> **Rôle :** ${p.roleId ? `<@&${p.roleId}>` : 'Non configuré'}`,
            `> **Catégorie :** ${p.categoryId ? (g.channels.cache.get(p.categoryId)?.name || '—') : '—'}`,
            `> **Salon jail :** ${p.jailChannelId ? `<#${p.jailChannelId}>` : '—'}`,
            `> **Salon vocal :** ${p.voiceChannelId ? (g.channels.cache.get(p.voiceChannelId)?.name || '—') : '—'}`,
            '',
            '**📧 Messages privés (quand un membre entre / sort de prison) :**',
            `> **État :** ${dm.enabled ? '✅ Activé' : '❌ Désactivé'}`,
            `> **MP entrée :** ${(dm.message || DEFAULT_DM_MESSAGE).slice(0, 60)}${(dm.message || DEFAULT_DM_MESSAGE).length > 60 ? '…' : ''}`,
            `> **MP sortie :** ${(dm.releaseMessage || DEFAULT_RELEASE_MESSAGE).slice(0, 60)}${(dm.releaseMessage || DEFAULT_RELEASE_MESSAGE).length > 60 ? '…' : ''}`,
            '',
            '_Utilise les boutons ci-dessous pour configurer._',
        ].join('\n'))
        .setFooter({ text: 'Le rôle est appliqué aussi automatiquement lors d\'un timeout.' })
        .setTimestamp();
}

function buildPanelRows(guild, settings) {
    const p = settings?.prison || {};
    const enabled = Boolean(p.enabled);
    const dmEnabled = Boolean(p.notifyDM?.enabled);

    const rows = [];

    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('prison_setup')
            .setLabel(enabled ? 'Réparer' : 'Configurer')
            .setStyle(ButtonStyle.Success)
            .setEmoji('⚙️'),
        new ButtonBuilder()
            .setCustomId('prison_dm_toggle')
            .setLabel(`Messages MP : ${dmEnabled ? 'ON' : 'OFF'}`)
            .setStyle(dmEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji('📧')
            .setDisabled(!enabled),
        new ButtonBuilder()
            .setCustomId('prison_preview')
            .setLabel('Aperçu MP')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👁️')
            .setDisabled(!enabled),
        new ButtonBuilder()
            .setCustomId('prison_disable')
            .setLabel('Désactiver')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⛔')
            .setDisabled(!enabled),
    ));

    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('prison_edit_dm')
            .setLabel('✏️ Message MP entrée')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📝')
            .setDisabled(!enabled),
        new ButtonBuilder()
            .setCustomId('prison_edit_release')
            .setLabel('✏️ Message MP sortie')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔓')
            .setDisabled(!enabled),
    ));

    return rows;
}

async function runSetup(client, guild, interaction, author) {
    const settings = await getGuildSettings(client, guild.id);
    const prison = settings.prison || {};

    // 1. Rôle klebs
    let role = prison.roleId ? guild.roles.cache.get(prison.roleId) : null;
    if (!role) role = guild.roles.cache.find(r => r.name === 'klebs' || r.name === 'Alcatraz' || r.name === 'alcatraz');
    let roleCreated = false;
    if (!role) {
        role = await guild.roles.create({ name: 'klebs', color: '#2C2F33', permissions: [], reason: `Système de prison — ${author.tag}` });
        roleCreated = true;
    }

    // 2. Catégorie prison
    let category = prison.categoryId ? guild.channels.cache.get(prison.categoryId) : null;
    if (!category) category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'prison');
    let categoryCreated = false;
    if (!category) {
        category = await guild.channels.create({
            name: 'prison', type: ChannelType.GuildCategory,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
                { id: role.id, allow: ['ViewChannel'] },
            ],
            reason: `Système de prison — ${author.tag}`,
        });
        categoryCreated = true;
    }

    // 3. Salon textuel jail
    let jailChannel = prison.jailChannelId ? guild.channels.cache.get(prison.jailChannelId) : null;
    if (!jailChannel) jailChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && ['jail', '🚧-cellule'].includes(c.name.toLowerCase()) && c.parentId === category.id);
    let jailCreated = false;
    if (!jailChannel) {
        jailChannel = await guild.channels.create({
            name: '🚧-cellule', type: ChannelType.GuildText, parent: category.id,
            topic: '⛓️ Cellule de prison — vous êtes en détention. Toute tentative d\'évasion sera sanctionnée.',
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
                { id: role.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks'] },
            ],
            reason: `Système de prison — ${author.tag}`,
        });
        jailCreated = true;
    }

    // 4. Salon vocal alcatraz
    let voiceChannel = prison.voiceChannelId ? guild.channels.cache.get(prison.voiceChannelId) : null;
    if (!voiceChannel) voiceChannel = guild.channels.cache.find(c => (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && ['alcatraz', '🔒-alcatraz'].includes(c.name.toLowerCase()) && c.parentId === category.id);
    let voiceCreated = false;
    if (!voiceChannel) {
        voiceChannel = await guild.channels.create({
            name: '🔒-alcatraz', type: ChannelType.GuildVoice, parent: category.id,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: ['ViewChannel', 'Connect'] },
                { id: role.id, allow: ['ViewChannel', 'Connect', 'Speak'] },
            ],
            reason: `Système de prison — ${author.tag}`,
        });
        voiceCreated = true;
    }

    await Guild.updateOne({ guildId: guild.id }, {
        'prison.enabled': true,
        'prison.roleId': role.id,
        'prison.categoryId': category.id,
        'prison.jailChannelId': jailChannel.id,
        'prison.voiceChannelId': voiceChannel.id,
    });
    invalidateGuildSettings(client, guild.id);

    const updatedSettings = await getGuildSettings(client, guild.id);
    const result = await PrisonService.applyDenyOverwrites(guild, role, updatedSettings.prison);

    const createdItems = [
        roleCreated ? 'Rôle' : null,
        categoryCreated ? 'Catégorie' : null,
        jailCreated ? 'Salon jail' : null,
        voiceCreated ? 'Salon vocal' : null,
    ].filter(Boolean);

    const lines = [
        '✅ **Système de prison configuré !**',
        `**Rôle :** ${role}`,
        `**Catégorie :** ${category.name}`,
        `**Salon textuel :** ${jailChannel}`,
        `**Salon vocal :** ${voiceChannel.name}`,
        `**Salons mis à jour :** ${result.updated}${result.failed ? ` (${result.failed} échec(s))` : ''}`,
    ];
    if (createdItems.length) lines.push('', `🆕 **Créé(s) :** ${createdItems.join(', ')}`);
    else lines.push('', 'ℹ️ Rôle et salons déjà existants — **rien n\'a été recréé**.');
    lines.push('', 'ℹ️ Le prisonnier ne verra QUE la catégorie prison (cellule + alcatraz) — tout le reste lui est masqué.');

    return lines;
}

async function handleApply(client, message) {
    const settings = await getGuildSettings(client, message.guild.id);
    const roleId = settings.prison?.roleId;
    if (!roleId || !settings.prison?.enabled) {
        return message.channel.send({ embeds: [EmbedHelper.error('❌ Système de prison non configuré ou désactivé. Démarrez avec `-prison`.')] });
    }
    const role = message.guild.roles.cache.get(roleId);
    if (!role) return message.channel.send({ embeds: [EmbedHelper.error('❌ Rôle de prison introuvable.')] });

    const result = await PrisonService.applyDenyOverwrites(message.guild, role, settings.prison);
    message.channel.send({ embeds: [EmbedHelper.success([
        '✅ **Overwrites de prison réappliqués sur tous les salons.**',
        `**Salons mis à jour :** ${result.updated}${result.failed ? ` (${result.failed} échec(s))` : ''}`,
    ].filter(Boolean).join('\n'))] });
}

async function handleStatus(client, message) {
    const settings = await getGuildSettings(client, message.guild.id);
    const p = settings.prison || {};
    const guild = message.guild;
    const dm = p.notifyDM || {};

    message.channel.send({ embeds: [EmbedHelper.info('⛓️ Statut du système de prison', [
        `**Activé :** ${p.enabled ? '✅' : '❌'}`,
        `**Rôle :** ${p.roleId ? `<@&${p.roleId}>` : 'Non configuré'}`,
        `**Catégorie :** ${p.categoryId ? (guild.channels.cache.get(p.categoryId)?.name || p.categoryId) : 'Non configurée'}`,
        `**Salon jail :** ${p.jailChannelId ? `<#${p.jailChannelId}>` : 'Non configuré'}`,
        `**Salon vocal :** ${p.voiceChannelId ? (guild.channels.cache.get(p.voiceChannelId)?.name || p.voiceChannelId) : 'Non configuré'}`,
        `**Messages MP :** ${dm.enabled ? '✅ Activé' : '❌ Désactivé'}`,
    ].join('\n'))] });
}

async function handleDisable(client, message) {
    await Guild.updateOne({ guildId: message.guild.id }, { 'prison.enabled': false });
    invalidateGuildSettings(client, message.guild.id);
    message.channel.send({ embeds: [EmbedHelper.success('❌ Système de prison désactivé (rôle et salons conservés).')] });
}

module.exports.openPrisonPanel = openPrisonPanel;
module.exports.handlePrisonModal = handlePrisonModal;
module.exports.canPrisonCommand = canPrisonCommand;
