'use strict';

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
} = require('discord.js');
const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const PermissionsHelper = require('../../utils/permissions');
const { getEmoji } = require('../../config/emojis');
const { LOG_CATEGORIES, ALL_LOG_ENTRIES, getLogEntry, ensureLogsSetup } = require('../../utils/logConfig');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');

// Rediriger ou couper ces logs permettrait de cacher une attaque : même règle que -secur.
const PROTECTED_KEYS = new Set(['securityLogs', 'raidLogs']);
const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

function canEditEntry(client, member, settings, entry) {
    if (!PROTECTED_KEYS.has(entry.key)) return true;
    return member.guild.ownerId === member.id
        || settings.owners?.includes(member.id)
        || PermissionsHelper.isBotOwner(client, member.id);
}

/** Mises à jour pour lier (ou délier avec null) un type de log à un salon. */
function entryUpdates(entry, channelId) {
    const updates = { [`logs.${entry.key}`]: channelId };
    for (const key of entry.secondaryKeys || []) updates[`logs.${key}`] = channelId;
    if (channelId) updates['logs.enabled'] = true;
    return updates;
}

const channelText = id => (id ? `<#${id}>` : `${getEmoji('OFF')} —`);

async function save(client, guildId, updates) {
    await Guild.updateOne({ guildId }, updates);
    invalidateGuildSettings(client, guildId);
    return getGuildSettings(client, guildId);
}

// ─── Rendu du panneau ───────────────────────────────────────────

const button = (id, label, emoji, style = ButtonStyle.Secondary, disabled = false) =>
    new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style).setDisabled(disabled);
const row = (...components) => new ActionRowBuilder().addComponents(...components);

function renderHome(guild, settings, state) {
    const logs = settings.logs || {};
    const configured = ALL_LOG_ENTRIES.filter(entry => logs[entry.key]).length;

    const embed = new EmbedBuilder()
        .setColor(logs.enabled ? 0x3FD39C : 0xA3ADBA)
        .setTitle(`📜 Logs · ${guild.name}`)
        .setDescription([
            `**État** · ${logs.enabled ? '🟢 activés' : '⚫ désactivés'} · **${configured}/${ALL_LOG_ENTRIES.length}** salons configurés`,
            `**Salon par défaut** · ${channelText(logs.channel)}`,
            state.notice ? `\n> ${state.notice}` : '',
        ].filter(Boolean).join('\n'))
        .addFields(LOG_CATEGORIES.map(category => ({
            name: category.name,
            value: category.entries.map(entry => `${entry.label} · ${channelText(logs[entry.key])}`).join('\n'),
        })))
        .setFooter({ text: 'Choisis un type de log pour changer son salon' });

    const components = [
        row(new StringSelectMenuBuilder()
            .setCustomId('logs_entry')
            .setPlaceholder('Configurer un type de log…')
            .addOptions(ALL_LOG_ENTRIES.map(entry => ({
                label: entry.label,
                value: entry.key,
                description: `${entry.group}${logs[entry.key] ? ' · configuré' : ' · non configuré'}`,
            })))),
        row(
            button('logs_setup', 'Créer tous les salons', '✨', ButtonStyle.Success),
            button('logs_toggle', logs.enabled ? 'Désactiver' : 'Activer', logs.enabled ? '⚫' : '🟢'),
            button('logs_default_here', 'Défaut : ici', '📌'),
            state.confirm
                ? button('logs_reset_confirm', 'Confirmer la réinitialisation', '⚠️', ButtonStyle.Danger)
                : button('logs_reset', 'Réinitialiser', '🗑️', ButtonStyle.Danger, configured === 0 && !logs.channel),
        ),
    ];
    return { embeds: [embed], components };
}

function renderEntry(settings, state, editable) {
    const entry = ALL_LOG_ENTRIES.find(e => e.key === state.entryKey);
    const current = settings.logs?.[entry.key];

    const embed = new EmbedBuilder()
        .setColor(current ? 0x3FD39C : 0xA3ADBA)
        .setTitle(`📜 Logs ${entry.label}`)
        .setDescription([
            `**Catégorie** · ${entry.group}`,
            `**Salon** · ${channelText(current)}`,
            `**Commande rapide** · \`-logs ${entry.aliases?.[0] || entry.key} #salon\``,
            editable ? '' : `\n${getEmoji('LOCK')} Seuls le propriétaire du serveur et les owners peuvent modifier ce log.`,
            state.notice ? `\n> ${state.notice}` : '',
        ].filter(Boolean).join('\n'));

    const components = [
        row(new ChannelSelectMenuBuilder()
            .setCustomId('logs_channel')
            .setPlaceholder('Choisir le salon')
            .setChannelTypes(...TEXT_CHANNELS)
            .setDisabled(!editable)),
        row(
            button('logs_here', 'Ici', '📌', ButtonStyle.Primary, !editable),
            button('logs_test', 'Tester', '🔔', ButtonStyle.Secondary, !current),
            button('logs_remove', 'Retirer', '🗑️', ButtonStyle.Danger, !editable || !current),
            button('logs_home', 'Retour', '◀️'),
        ),
    ];
    return { embeds: [embed], components };
}

function render(guild, settings, state, member, client) {
    if (state.entryKey) {
        const entry = ALL_LOG_ENTRIES.find(e => e.key === state.entryKey);
        return renderEntry(settings, state, canEditEntry(client, member, settings, entry));
    }
    return renderHome(guild, settings, state);
}

async function sendTest(guild, channelId, entry, user) {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return `${getEmoji('ERROR')} Salon introuvable.`;
    const me = guild.members.me;
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return `${getEmoji('ERROR')} Il me manque des permissions dans ${channel} (voir, écrire, intégrer des liens).`;
    }
    await channel.send({ embeds: [EmbedHelper.log({ title: `🔔 Test des logs ${entry.label}`, description: `Ce salon reçoit bien les logs **${entry.label}**.\n-# test lancé par ${user}` })] });
    return `Message de test envoyé dans ${channel}.`;
}

// ─── Commande ───────────────────────────────────────────────────

module.exports = {
    name: 'logs',
    aliases: ['log', 'setlogs', 'logconfig'],
    category: 'logs',
    description: 'Configure les salons de logs (panneau interactif ou commandes rapides).',
    usage: '-logs | -logs setup | -logs on/off | -logs <type> #salon/here/off | -logs default #salon',
    permissions: ['ManageGuild'],
    botPermissions: ['ManageChannels'],

    async run(client, message, args) {
        const guild = message.guild;
        let settings = await getGuildSettings(client, guild.id);
        const sub = (args[0] || '').toLowerCase();

        // ── Commandes rapides ──
        if (sub === 'setup' || sub === 'create') {
            const result = await ensureLogsSetup(guild, client.user.id);
            await save(client, guild.id, result.updates);
            const failed = result.failed.length ? `\n${getEmoji('WARNING')} ${result.failed.length} échec(s) : ${result.failed.map(f => f.entry.label).join(', ')}` : '';
            return message.channel.send({ embeds: [EmbedHelper.success(`Logs configurés : **${result.created.length}** salon(s) créé(s), **${result.reused.length}** réutilisé(s).${failed}`)] });
        }
        if (sub === 'on' || sub === 'off') {
            await save(client, guild.id, { 'logs.enabled': sub === 'on' });
            return message.channel.send({ embeds: [EmbedHelper.success(`Logs **${sub === 'on' ? 'activés' : 'désactivés'}**.`)] });
        }
        if (sub === 'default' || sub === 'defaut' || sub === 'défaut') {
            const channel = args[1] === 'here' ? message.channel : message.mentions.channels.first() || guild.channels.cache.get(args[1]);
            if (args[1] !== 'off' && !channel) return message.channel.send({ embeds: [EmbedHelper.error('Usage : `-logs default #salon|here|off`')] });
            await save(client, guild.id, { 'logs.channel': channel?.id || null, ...(channel ? { 'logs.enabled': true } : {}) });
            return message.channel.send({ embeds: [EmbedHelper.success(channel ? `Salon par défaut : ${channel}` : 'Salon par défaut retiré.')] });
        }
        if (sub && sub !== 'list') {
            const entry = getLogEntry(sub);
            if (!entry) {
                return message.channel.send({ embeds: [EmbedHelper.error(`Type de log inconnu : \`${sub}\`. Types : ${ALL_LOG_ENTRIES.map(e => `\`${e.aliases?.[0] || e.key}\``).join(', ')}`)] });
            }
            if (!canEditEntry(client, message.member, settings, entry)) {
                return message.channel.send({ embeds: [EmbedHelper.error('Seuls le propriétaire du serveur et les owners peuvent modifier ce log.')] });
            }
            const target = (args[1] || '').toLowerCase();
            const channel = target === 'here' || target === 'ici' ? message.channel
                : message.mentions.channels.first() || guild.channels.cache.get(args[1]);
            if (target !== 'off' && (!channel || !TEXT_CHANNELS.includes(channel.type))) {
                return message.channel.send({ embeds: [EmbedHelper.error(`Usage : \`-logs ${sub} #salon|here|off\``)] });
            }
            await save(client, guild.id, entryUpdates(entry, channel?.id || null));
            return message.channel.send({ embeds: [EmbedHelper.success(channel ? `Logs **${entry.label}** → ${channel}` : `Logs **${entry.label}** retirés.`)] });
        }

        // ── Panneau ──
        const state = { entryKey: null, notice: null, confirm: false };
        const panel = await message.channel.send(render(guild, settings, state, message.member, client));
        const collector = panel.createMessageComponentCollector({ time: 10 * 60 * 1000 });

        collector.on('collect', async (interaction) => {
            try {
                if (interaction.user.id !== message.author.id) {
                    return interaction.reply({ embeds: [EmbedHelper.error('Seul l\'auteur peut utiliser ce panneau.')], flags: 64 });
                }
                collector.resetTimer();
                const { customId } = interaction;
                const wasConfirming = state.confirm;
                state.notice = null;
                state.confirm = false;
                const entry = ALL_LOG_ENTRIES.find(e => e.key === state.entryKey);
                const editable = entry ? canEditEntry(client, message.member, settings, entry) : true;

                if (customId === 'logs_entry') {
                    state.entryKey = interaction.values[0];
                } else if (customId === 'logs_home') {
                    state.entryKey = null;
                } else if (customId === 'logs_setup') {
                    await interaction.deferUpdate();
                    const result = await ensureLogsSetup(guild, client.user.id);
                    settings = await save(client, guild.id, result.updates);
                    state.notice = `**${result.created.length}** salon(s) créé(s), **${result.reused.length}** réutilisé(s)${result.failed.length ? `, ${result.failed.length} échec(s)` : ''}.`;
                    return panel.edit(render(guild, settings, state, message.member, client));
                } else if (customId === 'logs_toggle') {
                    settings = await save(client, guild.id, { 'logs.enabled': !settings.logs?.enabled });
                } else if (customId === 'logs_default_here') {
                    settings = await save(client, guild.id, { 'logs.channel': interaction.channel.id, 'logs.enabled': true });
                    state.notice = 'Ce salon reçoit maintenant les logs sans salon dédié.';
                } else if (customId === 'logs_reset') {
                    state.confirm = true;
                    state.notice = 'Clique sur **Confirmer** pour retirer tous les salons de logs.';
                } else if (customId === 'logs_reset_confirm' && wasConfirming) {
                    const updates = { 'logs.channel': null };
                    const canProtected = canEditEntry(client, message.member, settings, { key: 'securityLogs' });
                    for (const e of ALL_LOG_ENTRIES) {
                        if (canProtected || !PROTECTED_KEYS.has(e.key)) Object.assign(updates, entryUpdates(e, null));
                    }
                    settings = await save(client, guild.id, updates);
                    state.notice = canProtected ? 'Tous les salons de logs ont été retirés.' : 'Salons retirés (sauf sécurité et raid, réservés aux owners).';
                } else if ((customId === 'logs_channel' || customId === 'logs_here') && entry && editable) {
                    const channelId = customId === 'logs_here' ? interaction.channel.id : interaction.values[0];
                    settings = await save(client, guild.id, entryUpdates(entry, channelId));
                    state.notice = `Logs **${entry.label}** → <#${channelId}>`;
                } else if (customId === 'logs_remove' && entry && editable) {
                    settings = await save(client, guild.id, entryUpdates(entry, null));
                    state.notice = `Logs **${entry.label}** retirés.`;
                } else if (customId === 'logs_test' && entry && settings.logs?.[entry.key]) {
                    state.notice = await sendTest(guild, settings.logs[entry.key], entry, interaction.user);
                }

                await interaction.update(render(guild, settings, state, message.member, client));
            } catch (error) {
                const notice = { embeds: [EmbedHelper.error(`Erreur : ${error.message}`)], flags: 64 };
                try {
                    if (interaction.deferred || interaction.replied) await interaction.followUp(notice);
                    else await interaction.reply(notice);
                } catch { /* interaction expirée */ }
            }
        });

        collector.on('end', () => {
            panel.edit({ components: [] }).catch(() => {});
        });
    },
};
