'use strict';

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');
const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');
const { updateStatsChannels, startStatsUpdater, stopStatsUpdater } = require('./statschannels');
const { mapLimit } = require('../../utils/concurrency');

const COUNTER_OPTIONS = [
    { key: 'serverNameId', label: 'Nom du serveur', emoji: '🏠', preview: stats => `🏠 ${stats.guildName}` },
    { key: 'memberCountId', label: 'Nombre de membres', emoji: '👥', preview: stats => `👥 Membres : ${stats.members}` },
    { key: 'onlineCountId', label: 'Membres en ligne', emoji: '🟢', preview: stats => `🟢 Actifs : ${stats.online}` },
    { key: 'voiceCountId', label: 'Membres en vocal', emoji: '🔊', preview: stats => `🔊 En vocal : ${stats.voice}` },
    { key: 'boosterCountId', label: 'Boosts', emoji: '💎', preview: stats => `💎 Boosts : ${stats.boosts}` },
];

module.exports = {
    name: 'statsconfig',
    aliases: ['statspanel', 'stats-panel'],
    category: 'logs',
    description: 'Ouvre un panneau interactif pour choisir les salons de statistiques du serveur.',
    usage: '-statsconfig',
    permissions: ['Administrator'],
    botPermissions: ['ManageChannels'],
    async run(client, message) {
        return openStatsPanel(client, message);
    },
};

async function openStatsPanel(client, message) {
    const guild = message.guild;
    const guildId = guild.id;

    let settings = await getGuildSettings(client, guildId, { create: false });

    const panelMessage = await message.channel.send({
        embeds: [buildStatsEmbed(guild, settings)],
        components: buildStatsRows(guild, settings),
    });

    if (typeof panelMessage.createMessageComponentCollector !== 'function') return;

    const collector = panelMessage.createMessageComponentCollector({ time: 10 * 60 * 1000 });

    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
            await interaction.reply({ embeds: [EmbedHelper.error('Seul l\'auteur peut utiliser ce panneau.')], flags: 64 });
            return;
        }

        const customId = interaction.customId;
        const enabled = Boolean(settings?.statsChannels?.categoryId);

        try {
            if (customId === 'stats_enable' && interaction.isButton()) {
                await interaction.deferUpdate().catch(() => {});
                await enableStats(client, guild, interaction);
                settings = await getGuildSettings(client, guildId, { create: false });
                await panelMessage.edit({ embeds: [buildStatsEmbed(guild, settings)], components: buildStatsRows(guild, settings) }).catch(() => {});
                return;
            }

            if (customId === 'stats_disable' && interaction.isButton()) {
                await interaction.deferUpdate().catch(() => {});
                await disableStats(client, guild);
                settings = await getGuildSettings(client, guildId, { create: false });
                await panelMessage.edit({ embeds: [buildStatsEmbed(guild, settings)], components: buildStatsRows(guild, settings) }).catch(() => {});
                return;
            }

            if (customId === 'stats_sync' && interaction.isButton()) {
                await interaction.deferUpdate().catch(() => {});
                const result = await updateStatsChannels(client, guild, { forceMemberFetch: true, createMissing: true });
                await interaction.editReply({
                    embeds: [EmbedHelper.success(`Salons de stats synchronisés (${result.updated} renommé(s), ${result.created} créé(s)).`)],
                }).catch(() => {});
                return;
            }

            if (customId === 'stats_counters' && interaction.isStringSelectMenu() && enabled) {
                // Acquitte d'abord : la suppression de salons ci-dessous peut dépasser les 3s.
                await interaction.deferUpdate();
                const selected = interaction.values;
                const updates = {};
                for (const opt of COUNTER_OPTIONS) {
                    if (selected.includes(opt.key)) {
                        // garder l'ID existant s'il existe
                        const existing = settings?.statsChannels?.[opt.key];
                        if (!existing) updates[`statsChannels.${opt.key}`] = null; // marqué à réparer au sync
                    } else {
                        // retirer le compteur
                        const channelId = settings?.statsChannels?.[opt.key];
                        updates[`statsChannels.${opt.key}`] = null;
                        if (channelId) {
                            const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
                            if (channel) await channel.delete('[Stats] Compteur désactivé').catch(() => {});
                        }
                    }
                }
                await Guild.updateOne({ guildId }, updates);
                invalidateGuildSettings(client, guildId);
                settings = await getGuildSettings(client, guildId, { create: false });
                await interaction.editReply({ embeds: [buildStatsEmbed(guild, settings)], components: buildStatsRows(guild, settings) });
                return;
            }

            await interaction.update({ embeds: [buildStatsEmbed(guild, settings)], components: buildStatsRows(guild, settings) });
        } catch (error) {
            const notice = { embeds: [EmbedHelper.error(`Erreur : ${error.message}`)], flags: 64 };
            try {
                // Si le composant a déjà été acquitté (deferUpdate), reply n'est plus valable.
                if (interaction.deferred || interaction.replied) await interaction.followUp(notice);
                else await interaction.reply(notice);
            } catch { /* ignore */ }
        }
    });

    collector.on('end', async () => {
        try { await panelMessage.edit({ components: [] }).catch(() => {}); } catch { /* ignore */ }
    });
}

async function enableStats(client, guild, interaction) {
    const result = await updateStatsChannels(client, guild, { forceMemberFetch: true, createMissing: true });
    startStatsUpdater(client, guild);
    const total = (result.updated || 0) + (result.created || 0);
    await interaction.editReply({
        embeds: [EmbedHelper.success(`🟢 Salons de stats **activés**. Compteurs créés/réparés : **${total}**.`)],
    }).catch(() => {});
}

async function disableStats(client, guild) {
    stopStatsUpdater(client, guild.id);
    const settings = await getGuildSettings(client, guild.id, { create: false });
    const saved = settings?.statsChannels;
    if (!saved?.categoryId) return;

    const ids = new Set();
    const addChannel = (id) => {
        if (!id) return;
        const ch = guild.channels.cache.get(id);
        if (ch) ids.add(ch.id);
    };
    for (const opt of COUNTER_OPTIONS) addChannel(saved[opt.key]);
    for (const roleId of Object.values(saved.roleCountIds || {})) addChannel(roleId);
    for (const [, ch] of guild.channels.cache) {
        if (ch.parentId === saved.categoryId) ids.add(ch.id);
    }

    await mapLimit([...ids], async (id) => {
        const ch = guild.channels.cache.get(id);
        if (ch) await ch.delete('[Stats] Désactivation').catch(() => {});
    }, 3);
    const category = guild.channels.cache.get(saved.categoryId);
    if (category) await category.delete('[Stats] Désactivation').catch(() => {});

    await Guild.updateOne({ guildId: guild.id }, { statsChannels: null });
    invalidateGuildSettings(client, guild.id);
}

function buildStatsEmbed(guild, settings) {
    const enabled = Boolean(settings?.statsChannels?.categoryId);
    const saved = settings?.statsChannels || {};

    const counterLines = COUNTER_OPTIONS.map(opt => {
        const active = Boolean(saved[opt.key]);
        return `${active ? '✅' : '⬜'} ${opt.emoji} ${opt.label}${active ? ` → <#${saved[opt.key]}>` : ''}`;
    });

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Salons de Statistiques')
        .setDescription([
            `Serveur : **${guild.name}**`,
            `État : **${enabled ? '🟢 Activé' : '⚫ Désactivé'}**`,
            '',
            '**Compteurs :**',
            ...counterLines,
            '',
            '_Choisis les compteurs dans le menu, puis appuie sur **Activer** pour créer les salons._',
            '_Les salons sont visibles par tous, mais personne ne peut les rejoindre._',
            '_Mise à jour automatique toutes les 5 minutes._',
        ].join('\n'))
        .setTimestamp();
}

function buildStatsRows(guild, settings) {
    const enabled = Boolean(settings?.statsChannels?.categoryId);
    const saved = settings?.statsChannels || {};
    const activeKeys = COUNTER_OPTIONS.filter(opt => saved[opt.key]).map(opt => opt.key);

    const rows = [];

    const counterSelect = new StringSelectMenuBuilder()
        .setCustomId('stats_counters')
        .setPlaceholder('Choisir les salons stats à afficher')
        .setMinValues(0)
        .setMaxValues(COUNTER_OPTIONS.length)
        .addOptions(COUNTER_OPTIONS.map(opt => ({
            label: opt.label,
            value: opt.key,
            emoji: opt.emoji,
            default: activeKeys.includes(opt.key),
        })))
        .setDisabled(!enabled);

    rows.push(new ActionRowBuilder().addComponents(counterSelect));

    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('stats_enable')
            .setLabel(enabled ? 'Réparer' : 'Activer')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🟢'),
        new ButtonBuilder()
            .setCustomId('stats_sync')
            .setLabel('Synchroniser')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄')
            .setDisabled(!enabled),
        new ButtonBuilder()
            .setCustomId('stats_disable')
            .setLabel('Désactiver')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
            .setDisabled(!enabled),
    ));

    return rows;
}
