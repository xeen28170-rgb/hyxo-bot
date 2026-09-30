'use strict';

const TempVoice = require('../../models/TempVoice');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const Guild = require('../../models/Guild');
const Logger = require('../../utils/logger');
const { settleWithin } = require('../../utils/concurrency');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    EmbedBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');

module.exports = {
    name: 'tempvoc',
    category: 'tempvoc',
    description: 'Ouvre le panneau TempVoc.',
    usage: '-tempvoc',
    cooldown: 5,
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        if (!sub) return sendTempVocPanel(client, message);

        if (['setup', 'enable', 'disable', 'channel', 'category'].includes(sub)) {
            if (!message.member.permissions.has('ManageChannels')) {
                return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.no_permission'))] });
            }
            if (sub === 'setup') {
                return handleSetup(client, message, args[1]?.toLowerCase(), args.slice(2));
            }
            return handleSetup(client, message, sub, args.slice(1));
        }

        const tempVoc = await TempVoice.findOne({ guildId: message.guild.id, ownerId: message.author.id });
        if (!tempVoc) return message.channel.send({ embeds: [EmbedHelper.error(message.t('tempvoc.not_in_channel'))] });

        const channel = message.guild.channels.cache.get(tempVoc.channelId);
        if (!channel) {
            await TempVoice.deleteOne({ _id: tempVoc._id });
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Votre salon vocal n\'existe plus.')] });
        }

        switch (sub) {
            case 'rename':
            case 'name': {
                const name = args.slice(1).join(' ').slice(0, 32);
                if (!name) return message.channel.send({ embeds: [EmbedHelper.error('❌ Fournissez un nom.')] });
                const pending = channel.setName(name);
                const applied = await settleWithin(pending, 8000);
                if (!applied.done) {
                    // Discord limite les renommages (2 / 10 min) : la requête reste en file d'attente
                    // et sera appliquée toute seule, on ne fige pas la commande.
                    pending.then(() => TempVoice.updateOne({ _id: tempVoc._id }, { name })).catch(() => {});
                    return message.channel.send({ embeds: [EmbedHelper.warning('Discord limite les renommages (2 toutes les 10 minutes). Le nouveau nom sera appliqué dès que possible.')] });
                }
                await TempVoice.updateOne({ _id: tempVoc._id }, { name });
                return message.channel.send({ embeds: [EmbedHelper.success(message.t('tempvoc.renamed', { name }))] });
            }

            case 'lock':
                await channel.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: false });
                await TempVoice.updateOne({ _id: tempVoc._id }, { locked: true });
                return message.channel.send({ embeds: [EmbedHelper.success(message.t('tempvoc.locked'))] });

            case 'unlock':
                await channel.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: null });
                await TempVoice.updateOne({ _id: tempVoc._id }, { locked: false });
                return message.channel.send({ embeds: [EmbedHelper.success(message.t('tempvoc.unlocked'))] });

            case 'limit': {
                const limit = parseInt(args[1]);
                if (isNaN(limit) || limit < 0 || limit > 99) return message.channel.send({ embeds: [EmbedHelper.error('❌ Limite invalide (0-99).')] });
                await channel.setUserLimit(limit);
                await TempVoice.updateOne({ _id: tempVoc._id }, { limit });
                return message.channel.send({ embeds: [EmbedHelper.success(message.t('tempvoc.limit_set', { limit: limit || 'Illimité' }))] });
            }

            case 'hide':
                // Le propriétaire garde ViewChannel : sinon il ne voit plus son propre salon et ne
                // peut plus l'afficher.
                await Promise.all([
                    channel.permissionOverwrites.edit(tempVoc.ownerId, { ViewChannel: true }),
                    channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false }),
                ]);
                await TempVoice.updateOne({ _id: tempVoc._id }, { hidden: true });
                return message.channel.send({ embeds: [EmbedHelper.success(message.t('tempvoc.hidden'))] });

            case 'show':
            case 'unhide':
                await channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null });
                await TempVoice.updateOne({ _id: tempVoc._id }, { hidden: false });
                return message.channel.send({ embeds: [EmbedHelper.success(message.t('tempvoc.shown'))] });

            case 'permit':
            case 'allow': {
                const member = await Helpers.resolveMember(message.guild, args[1]);
                if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });
                await channel.permissionOverwrites.edit(member.id, { Connect: true, ViewChannel: true });
                await TempVoice.updateOne({ _id: tempVoc._id }, { $addToSet: { permitted: member.id } });
                return message.channel.send({ embeds: [EmbedHelper.success(message.t('tempvoc.permitted', { user: member.user.tag }))] });
            }

            case 'deny': {
                const member = await Helpers.resolveMember(message.guild, args[1]);
                if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });
                await channel.permissionOverwrites.edit(member.id, { Connect: false });
                if (member.voice.channelId === channel.id) {
                    await member.voice.disconnect('Accès refusé à ce salon').catch(() => {});
                }
                await TempVoice.updateOne({ _id: tempVoc._id }, { $addToSet: { denied: member.id } });
                return message.channel.send({ embeds: [EmbedHelper.error(message.t('tempvoc.denied', { user: member.user.tag }))] });
            }

            case 'transfer': {
                const member = await Helpers.resolveMember(message.guild, args[1]);
                if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });
                if (member.id === message.author.id) return message.channel.send({ embeds: [EmbedHelper.error('❌ Vous êtes déjà propriétaire.')] });

                await channel.permissionOverwrites.edit(message.author.id, { ManageChannels: null, MoveMembers: null, Connect: null, ViewChannel: null });
                await channel.permissionOverwrites.edit(member.id, { ManageChannels: true, MoveMembers: true, Connect: true, ViewChannel: true });
                await TempVoice.updateOne({ _id: tempVoc._id }, { ownerId: member.id });
                return message.channel.send({ embeds: [EmbedHelper.success(message.t('tempvoc.transferred', { user: member.user.tag }))] });
            }

            case 'delete':
                await channel.delete('Suppression manuelle').catch(() => {});
                await TempVoice.deleteOne({ _id: tempVoc._id });
                // .catch : si la commande a été tapée dans le chat du vocal supprimé, l'envoi échoue.
                return message.channel.send({ embeds: [EmbedHelper.success('Salon vocal supprimé.')] }).catch(() => {});

            default:
                return sendHelp(client, message);
        }
    },
};

function formatChannel(channelId) {
    return channelId ? `<#${channelId}>` : 'Non configuré';
}

function buildTempVocEmbed(guild, settings, tempVoc, channel) {
    const config = settings.tempvoc || {};
    const userLines = tempVoc ? [
        '',
        '**Votre salon temporaire**',
        `Salon: ${channel ? `<#${channel.id}>` : 'Introuvable'}`,
        `Verrouillé: ${tempVoc.locked ? '✅ Oui' : '❌ Non'}`,
        `Masqué: ${tempVoc.hidden ? '✅ Oui' : '❌ Non'}`,
        `Limite: ${tempVoc.limit || channel?.userLimit || 'Illimité'}`,
    ] : [
        '',
        '**Votre salon temporaire**',
        'Aucun salon temporaire trouvé pour vous.',
    ];

    return new EmbedBuilder()
        .setColor(EmbedHelper.Colors.TEMPVOC)
        .setTitle('🎤 Panneau TempVoc')
        .setDescription([
            `Serveur: **${guild.name}**`,
            `Système: **${config.enabled ? '✅ Activé' : '❌ Désactivé'}**`,
            `Salon de création: ${formatChannel(config.createChannel)}`,
            `Catégorie: ${formatChannel(config.category)}`,
            `Nom par défaut: \`${config.defaultName || '{user}\'s Channel'}\``,
            `Limite par défaut: ${config.defaultLimit || 'Illimité'}`,
            ...userLines,
        ].join('\n'))
        .setFooter({ text: 'Les sous-commandes restent disponibles pour les réglages précis.' })
        .setTimestamp();
}

function buildTempVocRows(settings, tempVoc, canManageChannels) {
    const rows = [];
    const config = settings.tempvoc || {};

    if (canManageChannels) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('tempvoc_panel_toggle')
                .setLabel(config.enabled ? 'Désactiver TempVoc' : 'Activer TempVoc')
                .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('tempvoc_panel_refresh')
                .setLabel('Rafraîchir')
                .setStyle(ButtonStyle.Secondary),
        ));

        rows.push(new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId('tempvoc_panel_create_channel')
                .setPlaceholder('Choisir le salon vocal de création')
                .setMinValues(1)
                .setMaxValues(1)
                .setChannelTypes(ChannelType.GuildVoice),
        ));

        rows.push(new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId('tempvoc_panel_category')
                .setPlaceholder('Choisir la catégorie TempVoc')
                .setMinValues(1)
                .setMaxValues(1)
                .setChannelTypes(ChannelType.GuildCategory),
        ));
    }

    if (tempVoc) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('tempvoc_panel_lock')
                .setLabel(tempVoc.locked ? 'Déverrouiller' : 'Verrouiller')
                .setStyle(tempVoc.locked ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('tempvoc_panel_hide')
                .setLabel(tempVoc.hidden ? 'Afficher' : 'Masquer')
                .setStyle(tempVoc.hidden ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('tempvoc_panel_delete')
                .setLabel('Supprimer')
                .setStyle(ButtonStyle.Danger),
        ));

        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('tempvoc_panel_limit')
                .setPlaceholder('Choisir une limite utilisateur')
                .addOptions(withEmojiObjects([
                    { label: 'Illimité', value: '0', emoji: '♾️' },
                    { label: '2 utilisateurs', value: '2', emoji: '2️⃣' },
                    { label: '5 utilisateurs', value: '5', emoji: '5️⃣' },
                    { label: '10 utilisateurs', value: '10', emoji: '🔟' },
                    { label: '25 utilisateurs', value: '25', emoji: '👥' },
                    { label: '99 utilisateurs', value: '99', emoji: '🔊' },
                ])),
        ));
    }

    if (!rows.length) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('tempvoc_panel_refresh')
                .setLabel('Rafraîchir')
                .setStyle(ButtonStyle.Secondary),
        ));
    }

    return rows.slice(0, 5);
}

// discord.js n'accepte pas un emoji en simple chaîne dans les options d'un menu
// (il attend { name }) : sans ça, la construction du panneau lève une ValidationError.
function withEmojiObjects(options) {
    return options.map(option => (typeof option.emoji === 'string'
        ? { ...option, emoji: { name: option.emoji } }
        : option));
}

async function getTempVocState(message) {
    const tempVoc = await TempVoice.findOne({ guildId: message.guild.id, ownerId: message.author.id });
    const channel = tempVoc ? message.guild.channels.cache.get(tempVoc.channelId) : null;
    if (tempVoc && !channel) {
        await TempVoice.deleteOne({ _id: tempVoc._id });
        return { tempVoc: null, channel: null };
    }
    return { tempVoc, channel };
}

async function sendTempVocPanel(client, message) {
    const guildId = message.guild.id;
    const canManageChannels = message.member.permissions.has('ManageChannels');
    let settings = message.guildSettings || await getGuildSettings(client, guildId);
    let { tempVoc, channel } = await getTempVocState(message);

    const panelMessage = await message.channel.send({
        embeds: [buildTempVocEmbed(message.guild, settings, tempVoc, channel)],
        components: buildTempVocRows(settings, tempVoc, canManageChannels),
    });

    if (!panelMessage.createMessageComponentCollector) return;
    const collector = panelMessage.createMessageComponentCollector({ time: 10 * 60 * 1000 });

    async function render(interaction) {
        settings = await getGuildSettings(client, guildId);
        ({ tempVoc, channel } = await getTempVocState(message));
        const payload = {
            embeds: [buildTempVocEmbed(message.guild, settings, tempVoc, channel)],
            components: buildTempVocRows(settings, tempVoc, canManageChannels),
        };
        // Interaction déjà acquittée (deferUpdate) → editReply, sinon update classique.
        if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
        else await interaction.update(payload);
    }

    async function handlePanelInteraction(interaction) {
        if (interaction.user.id !== message.author.id) {
            await interaction.reply({
                embeds: [EmbedHelper.error('Seul l\'auteur de la commande peut utiliser ce panneau.')],
                flags: 64,
            });
            return;
        }

        // Acquitte tout de suite : les appels Discord/DB ci-dessous peuvent dépasser
        // la fenêtre de 3s du jeton (sinon "Unknown interaction" en promesse non gérée).
        await interaction.deferUpdate();

        const customId = interaction.customId;
        const updates = {};

        if (customId === 'tempvoc_panel_refresh') {
            await render(interaction);
            return;
        }

        if (customId === 'tempvoc_panel_toggle') {
            if (!canManageChannels) return interaction.followUp({ embeds: [EmbedHelper.error(message.t('general.no_permission'))], flags: 64 });
            updates['tempvoc.enabled'] = !settings.tempvoc?.enabled;
        } else if (customId === 'tempvoc_panel_create_channel' && interaction.isChannelSelectMenu()) {
            if (!canManageChannels) return interaction.followUp({ embeds: [EmbedHelper.error(message.t('general.no_permission'))], flags: 64 });
            updates['tempvoc.createChannel'] = interaction.values[0];
            updates['tempvoc.enabled'] = true;
        } else if (customId === 'tempvoc_panel_category' && interaction.isChannelSelectMenu()) {
            if (!canManageChannels) return interaction.followUp({ embeds: [EmbedHelper.error(message.t('general.no_permission'))], flags: 64 });
            updates['tempvoc.category'] = interaction.values[0];
        }

        if (Object.keys(updates).length) {
            await Guild.updateOne({ guildId }, updates);
            invalidateGuildSettings(client, guildId);
            await render(interaction);
            return;
        }

        ({ tempVoc, channel } = await getTempVocState(message));
        if (!tempVoc || !channel) {
            await interaction.followUp({ embeds: [EmbedHelper.error('❌ Aucun salon temporaire à contrôler.')], flags: 64 });
            return;
        }

        if (customId === 'tempvoc_panel_lock') {
            const locked = !tempVoc.locked;
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: locked ? false : null });
            await TempVoice.updateOne({ _id: tempVoc._id }, { locked });
            await render(interaction);
            return;
        }

        if (customId === 'tempvoc_panel_hide') {
            const hidden = !tempVoc.hidden;
            await Promise.all([
                // Le propriétaire garde ViewChannel quand on masque (sinon auto-blocage).
                hidden ? channel.permissionOverwrites.edit(tempVoc.ownerId, { ViewChannel: true }) : null,
                channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: hidden ? false : null }),
            ]);
            await TempVoice.updateOne({ _id: tempVoc._id }, { hidden });
            await render(interaction);
            return;
        }

        if (customId === 'tempvoc_panel_limit' && interaction.isStringSelectMenu()) {
            const limit = parseInt(interaction.values[0], 10);
            await channel.setUserLimit(limit);
            await TempVoice.updateOne({ _id: tempVoc._id }, { limit });
            await render(interaction);
            return;
        }

        if (customId === 'tempvoc_panel_delete') {
            const { confirmInteraction } = require('../../utils/commandConfirmation');
            if (!await confirmInteraction(interaction, `Supprimer le salon vocal ${channel.name}`)) return;
            const current = await TempVoice.findOne({ _id: tempVoc._id });
            const blocked = await require('../../services/blacklistService').isBlocked(interaction.user.id);
            if (blocked || current?.ownerId !== interaction.user.id) return interaction.followUp({ content: 'Action arrêtée : vous ne possédez plus ce salon.', flags: 64 });
            await channel.delete('Suppression via panneau TempVoc');
            await TempVoice.deleteOne({ _id: tempVoc._id });
            ({ tempVoc, channel } = await getTempVocState(message));
            settings = await getGuildSettings(client, guildId);
            await panelMessage.edit({
                embeds: [buildTempVocEmbed(message.guild, settings, tempVoc, channel)],
                components: buildTempVocRows(settings, tempVoc, canManageChannels),
            }).catch(() => {});
        }
    }

    collector.on('collect', async (interaction) => {
        try {
            await handlePanelInteraction(interaction);
        } catch (error) {
            // Jamais de rejet non géré : on log et on prévient l'utilisateur si possible.
            Logger.error('[TempVoc] Erreur panneau:', error.message || String(error));
            const notice = { embeds: [EmbedHelper.error('❌ Une erreur est survenue, réessaie dans un instant.')], flags: 64 };
            if (interaction.deferred || interaction.replied) await interaction.followUp(notice).catch(() => {});
            else await interaction.reply(notice).catch(() => {});
        }
    });

    collector.on('end', async () => {
        try {
            const currentSettings = await getGuildSettings(client, guildId);
            const currentState = await getTempVocState(message);
            await panelMessage.edit({
                embeds: [buildTempVocEmbed(message.guild, currentSettings, currentState.tempVoc, currentState.channel)],
                components: [],
            });
        } catch {
            // message supprimé / inaccessible
        }
    });
}

async function handleSetup(client, message, sub, args) {
    switch (sub) {
        case 'enable':
            await Guild.updateOne({ guildId: message.guild.id }, { 'tempvoc.enabled': true });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('✅ TempVoc activé.')] });

        case 'disable':
            await Guild.updateOne({ guildId: message.guild.id }, { 'tempvoc.enabled': false });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.error('❌ TempVoc désactivé.')] });

        case 'channel': {
            const ch = Helpers.resolveChannel(message.guild, args[0]);
            if (!ch || ch.type !== 2) return message.channel.send({ embeds: [EmbedHelper.error('❌ Salon vocal introuvable.')] });
            await Guild.updateOne({ guildId: message.guild.id }, { 'tempvoc.createChannel': ch.id, 'tempvoc.enabled': true });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`✅ Salon de création: **${ch.name}**`)] });
        }

        case 'category': {
            const cat = Helpers.resolveCategory(message.guild, args.join(' '));
            if (!cat) return message.channel.send({ embeds: [EmbedHelper.error('❌ Catégorie introuvable.')] });
            await Guild.updateOne({ guildId: message.guild.id }, { 'tempvoc.category': cat.id });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`✅ Catégorie tempvoc: **${cat.name}**`)] });
        }

        default:
            return sendHelp(client, message);
    }
}

function sendHelp(client, message) {
    const prefix = message.guildSettings?.prefix || client.prefix;
    message.channel.send({ embeds: [EmbedHelper.info('🎤 TempVoc — Aide', [
        `\`${prefix}tempvoc rename <nom>\` — Renommer`,
        `\`${prefix}tempvoc lock/unlock\` — Verrouiller/Déverrouiller`,
        `\`${prefix}tempvoc limit <0-99>\` — Limite d'utilisateurs`,
        `\`${prefix}tempvoc hide/show\` — Masquer/Afficher`,
        `\`${prefix}tempvoc permit <utilisateur>\` — Autoriser`,
        `\`${prefix}tempvoc deny <utilisateur>\` — Refuser`,
        `\`${prefix}tempvoc transfer <utilisateur>\` — Transférer`,
        `\`${prefix}tempvoc delete\` — Supprimer`,
        '',
        '**Config (Admin)**',
        `\`${prefix}tempvoc setup channel <salon vocal>\` — Configurer`,
        `\`${prefix}tempvoc setup category <catégorie>\` — Catégorie`,
    ].join('\n'), { color: 0x9B59B6 })] });
}
