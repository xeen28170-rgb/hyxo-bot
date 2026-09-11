'use strict';

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    UserSelectMenuBuilder,
} = require('discord.js');
const Guild = require('../models/Guild');
const EmbedHelper = require('./embedBuilder');
const { ALL_LOG_ENTRIES, ensureLogsSetup } = require('./logConfig');
const { getGuildSettings, invalidateGuildSettings } = require('./guildSettings');

const SECURITY_MODULES = [
    { id: 'antichannel', label: 'Anti Channel', emoji: '📁', statePath: 'antiraid.antichannel', thresholdPath: 'antiraid.thresholds.antichannel', punishmentPath: 'antiraid.punishments.antichannel' },
    { id: 'antirole', label: 'Anti Role', emoji: '🎭', statePath: 'antiraid.antirole', thresholdPath: 'antiraid.thresholds.antirole', punishmentPath: 'antiraid.punishments.antirole' },
    { id: 'antiwebhook', label: 'Anti Webhook', emoji: '🔗', statePath: 'antiraid.antiwebhook', thresholdPath: 'antiraid.thresholds.antiwebhook', punishmentPath: 'antiraid.punishments.antiwebhook' },
    { id: 'antibot', label: 'Anti Bot', emoji: '🤖', statePath: 'antiraid.antibot', thresholdPath: 'antiraid.thresholds.antibot', punishmentPath: 'antiraid.punishments.antibot' },
    { id: 'antiban', label: 'Anti Ban', emoji: '🔨', statePath: 'antiraid.antiban', thresholdPath: 'antiraid.thresholds.antiban', punishmentPath: 'antiraid.punishments.antiban' },
    { id: 'antikick', label: 'Anti Kick', emoji: '👢', statePath: 'antiraid.antikick', thresholdPath: 'antiraid.thresholds.antikick', punishmentPath: 'antiraid.punishments.antikick' },
    { id: 'antiunban', label: 'Anti Unban', emoji: '🔓', statePath: 'antiraid.antiunban', thresholdPath: 'antiraid.thresholds.antiunban', punishmentPath: 'antiraid.punishments.antiunban' },
    { id: 'antiupdate', label: 'Anti Update', emoji: '⚙️', statePath: 'antiraid.antiupdate', thresholdPath: 'antiraid.thresholds.antiupdate', punishmentPath: 'antiraid.punishments.antiupdate' },
    { id: 'antitoken', label: 'Anti Token', emoji: '🔑', statePath: 'antiraid.antitoken', thresholdPath: 'antiraid.thresholds.antitoken', punishmentPath: 'antiraid.punishments.antitoken' },
    { id: 'antieveryone', label: 'Anti Everyone Raid', emoji: '📢', statePath: 'antiraid.antieveryone', thresholdPath: 'antiraid.thresholds.antieveryone', punishmentPath: 'antiraid.punishments.antieveryone' },
    { id: 'antihere', label: 'Anti Here Raid', emoji: '📣', statePath: 'antiraid.antihere', thresholdPath: 'antiraid.thresholds.antihere', punishmentPath: 'antiraid.punishments.antihere' },
    { id: 'antideco', label: 'Anti Deco', emoji: '🎨', statePath: 'antiraid.antideco', thresholdPath: 'antiraid.thresholds.antideco', punishmentPath: 'antiraid.punishments.antideco' },
    { id: 'blrank', label: 'Blacklisted Rank', emoji: '⛔', statePath: 'antiraid.blrank', punishmentPath: 'antiraid.punishments.blrank' },
];

const PAGES = [
    { label: 'Protections', value: 'protections', emoji: '🛡️' },
    { label: 'Whitelist', value: 'whitelist', emoji: '⚪' },
    { label: 'Owners', value: 'owners', emoji: '👑' },
    { label: 'Logs', value: 'logs', emoji: '🧾' },
];

const PUNISHMENTS = [
    { label: 'Derank', value: 'derank', emoji: '📉' },
    { label: 'Timeout', value: 'timeout', emoji: '⏱️' },
    { label: 'Kick', value: 'kick', emoji: '👢' },
    { label: 'Ban', value: 'ban', emoji: '🔨' },
];

function getValue(object, path) {
    return path.split('.').reduce((current, key) => current?.[key], object);
}

function moduleById(moduleId) {
    return SECURITY_MODULES.find(module => module.id === moduleId) || SECURITY_MODULES[0];
}

function getSelectedModules(state) {
    const ids = Array.isArray(state.selectedModules) ? state.selectedModules : [];
    const modules = ids.map(moduleById).filter(Boolean);
    return modules.length ? modules : [SECURITY_MODULES[0]];
}

function isModuleActive(settings, module) {
    const value = getValue(settings, module.statePath);
    return value && value !== 'off';
}

function stateLabel(settings, module) {
    const value = getValue(settings, module.statePath);
    if (value === 'max') return 'MAX';
    if (value === 'on') return 'ON';
    return 'OFF';
}

function stateEmoji(settings, module) {
    const value = getValue(settings, module.statePath);
    if (value === 'max') return '🔴';
    if (value === 'on') return '🟢';
    return '⚫';
}

function punishmentLabel(settings, module) {
    return getValue(settings, module.punishmentPath) || settings.antiraid?.punishment || 'derank';
}

function thresholdLabel(settings, module) {
    if (!module.thresholdPath) return '-';
    return String(getValue(settings, module.thresholdPath) ?? '3/10s');
}

function activeModules(settings) {
    return SECURITY_MODULES.filter(module => isModuleActive(settings, module)).length;
}

function configuredLogs(settings) {
    return ALL_LOG_ENTRIES.filter(entry => settings.logs?.[entry.key]).length;
}

function buildPageSelect(page) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('secur_page')
            .setPlaceholder('Choisir une section')
            .addOptions(PAGES.map(item => ({ ...item, default: item.value === page })))
    );
}

function buildModuleSelect(state) {
    const selectedIds = new Set(getSelectedModules(state).map(module => module.id));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('secur_modules')
            .setPlaceholder('Sélectionner des protections')
            .setMinValues(1)
            .setMaxValues(SECURITY_MODULES.length)
            .addOptions(SECURITY_MODULES.map(m => ({
                label: m.label,
                value: m.id,
                emoji: m.emoji,
                default: selectedIds.has(m.id),
            })))
    );
}

function buildLevelSelect() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('secur_level')
            .setPlaceholder('Appliquer un niveau aux modules sélectionnés')
            .addOptions([
                { label: 'OFF', value: 'off', emoji: '⚫' },
                { label: 'ON', value: 'on', emoji: '🟢' },
                { label: 'MAX', value: 'max', emoji: '🔴' },
            ])
    );
}

function buildPunishmentSelect(state) {
    const selected = getSelectedModules(state);
    const hasPunishment = selected.some(m => m.punishmentPath);
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('secur_punishment')
            .setPlaceholder(`Sanction (${selected.length} module(s))`)
            .setDisabled(!hasPunishment)
            .addOptions(PUNISHMENTS)
    );
}

function moduleLine(settings, module, selectedIds) {
    const marker = selectedIds.has(module.id) ? '▸' : ' ';
    return `${marker} ${stateEmoji(settings, module)} ${module.emoji} **${module.label}** → ${stateLabel(settings, module)} | ${punishmentLabel(settings, module)} | ${thresholdLabel(settings, module)}`;
}

function buildEmbed(guild, settings, state) {
    const selected = getSelectedModules(state);
    const selectedIds = new Set(selected.map(m => m.id));
    const base = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🛡️ Console Sécurité')
        .setDescription([
            `Serveur: **${guild.name}**`,
            `État: **${settings.antiraid?.enabled ? '🟢 ON' : '⚫ OFF'}** | Protections: **${activeModules(settings)}/${SECURITY_MODULES.length}** | Logs: **${settings.logs?.enabled ? '🟢 ON' : '⚫ OFF'}** (${configuredLogs(settings)}/${ALL_LOG_ENTRIES.length})`,
            state.notice ? `\n${'>'} ${state.notice}` : '',
        ].filter(Boolean).join('\n'))
        .setTimestamp();

    if (state.page === 'protections') {
        base.addFields(
            {
                name: `🛠️ Sélection (${selected.length})`,
                value: selected.map(m => `${m.emoji} ${m.label}`).join(' • ').slice(0, 1000),
                inline: false,
            },
            {
                name: '📋 Toutes les protections',
                value: SECURITY_MODULES.map(m => moduleLine(settings, m, selectedIds)).join('\n').slice(0, 1024),
                inline: false,
            },
        );
    } else if (state.page === 'whitelist') {
        const list = settings.antiraid?.whitelist || [];
        base.addFields({
            name: '✅ Whitelist antiraid',
            value: list.length ? list.map(id => `<@${id}> (\`${id}\`)`).join('\n').slice(0, 1000) : 'Aucun membre.',
        });
    } else if (state.page === 'owners') {
        const list = settings.owners || [];
        base.addFields({
            name: '👑 Owners du serveur',
            value: list.length ? list.map(id => `<@${id}> (\`${id}\`)`).join('\n').slice(0, 1000) : 'Aucun owner.',
        });
    } else if (state.page === 'logs') {
        base.addFields(
            { name: '📊 Configurés', value: `${configuredLogs(settings)}/${ALL_LOG_ENTRIES.length}`, inline: true },
            { name: '🛡️ Sécurité', value: settings.logs?.securityLogs ? `<#${settings.logs.securityLogs}>` : '❌ Non configuré', inline: true },
            { name: '🚨 Raid', value: settings.logs?.raidLogs ? `<#${settings.logs.raidLogs}>` : '❌ Non configuré', inline: true },
            { name: '🚧 Prison', value: settings.logs?.prisonLogs ? `<#${settings.logs.prisonLogs}>` : '❌ Non configuré', inline: true },
        );
    }

    return base;
}

function parseThreshold(value) {
    const text = String(value ?? '3/10s');
    const match = text.match(/^(\d+)(.*)$/);
    if (!match) return { count: 3, suffix: '/10s' };
    return { count: parseInt(match[1], 10), suffix: match[2] || '/10s' };
}

function nextThreshold(value, delta) {
    if (typeof value === 'number') return Math.max(1, Math.min(100, value + delta));
    const parsed = parseThreshold(value);
    return `${Math.max(1, Math.min(100, parsed.count + delta))}${parsed.suffix}`;
}

function applyModuleStates(settings, updates, modules, value) {
    for (const module of modules) updates[module.statePath] = value;
    const willHaveActiveModule = SECURITY_MODULES.some(module => {
        const next = updates[module.statePath] ?? getValue(settings, module.statePath);
        return next && next !== 'off';
    });
    updates['antiraid.enabled'] = willHaveActiveModule;
}

function buildRows(state) {
    const rows = [buildPageSelect(state.page)];

    if (state.page === 'protections') {
        const selected = getSelectedModules(state);
        const hasThreshold = selected.some(m => m.thresholdPath);

        rows.push(buildModuleSelect(state));
        rows.push(buildLevelSelect());
        rows.push(new ActionRowBuilder().addComponents(
            buildPunishmentSelect(state).components[0],
        ));
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('secur_threshold_down')
                .setLabel('−')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!hasThreshold),
            new ButtonBuilder()
                .setCustomId('secur_threshold_up')
                .setLabel('+')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!hasThreshold),
        ));
    } else if (state.page === 'whitelist' || state.page === 'owners') {
        const isOwners = state.page === 'owners';
        rows.push(new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(isOwners ? 'secur_owner_user' : 'secur_whitelist_user')
                .setPlaceholder(isOwners ? 'Ajouter/retirer un owner' : 'Ajouter/retirer whitelist')
                .setMinValues(1)
                .setMaxValues(1)
        ));
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(isOwners ? 'secur_owners_clear' : 'secur_whitelist_clear')
                .setLabel('Tout vider')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('secur_refresh')
                .setLabel('↻')
                .setStyle(ButtonStyle.Secondary),
        ));
    } else if (state.page === 'logs') {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('secur_logs_setup').setLabel('Créer logs').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('secur_logs_here').setLabel('Sécurité ici').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('secur_raid_logs_here').setLabel('Raid ici').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('secur_logs_toggle')
                .setLabel('Logs')
                .setStyle(ButtonStyle.Secondary),
        ));
    }

    return rows;
}

async function refresh(interaction, message, state, settings) {
    await interaction.update({
        embeds: [buildEmbed(message.guild, settings, state)],
        components: buildRows(state),
    });
}

module.exports = {
    SECURITY_MODULES,

    async open(client, message) {
        const guildId = message.guild.id;
        const state = {
            page: 'protections',
            selectedModules: [SECURITY_MODULES[0].id],
            notice: null,
        };
        let settings = await getGuildSettings(client, guildId);

        const panelMessage = await message.channel.send({
            embeds: [buildEmbed(message.guild, settings, state)],
            components: buildRows(state),
        });

        if (typeof panelMessage.createMessageComponentCollector !== 'function') return;
        const collector = panelMessage.createMessageComponentCollector({ time: 10 * 60 * 1000 });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) {
                await interaction.reply({ embeds: [EmbedHelper.error('Seul l\'auteur peut utiliser cette console.')], flags: 64 });
                return;
            }

            const updates = {};
            state.notice = null;
            const { customId } = interaction;

            if (customId === 'secur_page' && interaction.isStringSelectMenu()) {
                state.page = interaction.values[0];
            } else if (customId === 'secur_modules' && interaction.isStringSelectMenu()) {
                state.selectedModules = interaction.values;
            } else if (customId === 'secur_level' && interaction.isStringSelectMenu()) {
                const value = interaction.values[0];
                const modules = getSelectedModules(state);
                applyModuleStates(settings, updates, modules, value);
                state.notice = `✅ **${modules.length}** protection(s) → **${value.toUpperCase()}**.`;
            } else if (customId === 'secur_punishment' && interaction.isStringSelectMenu()) {
                const punishment = interaction.values[0];
                const modules = getSelectedModules(state);
                for (const m of modules) updates[m.punishmentPath] = punishment;
                if (modules.length === SECURITY_MODULES.length) updates['antiraid.punishment'] = punishment;
                state.notice = `⚡ Sanction **${punishment}** → ${modules.length} module(s).`;
            } else if (customId === 'secur_threshold_down' || customId === 'secur_threshold_up') {
                const delta = customId.endsWith('_up') ? 1 : -1;
                for (const m of getSelectedModules(state).filter(m => m.thresholdPath)) {
                    updates[m.thresholdPath] = nextThreshold(getValue(settings, m.thresholdPath), delta);
                }
            } else if (customId === 'secur_all_off' || customId === 'secur_all_on' || customId === 'secur_all_max') {
                const value = customId.split('_')[1];
                applyModuleStates(settings, updates, SECURITY_MODULES, value);
                state.notice = `✅ **${SECURITY_MODULES.length}** protections → **${value.toUpperCase()}**.`;
            } else if (customId === 'secur_whitelist_user' && interaction.isUserSelectMenu()) {
                const userId = interaction.values[0];
                const current = settings.antiraid?.whitelist || [];
                if (current.includes(userId)) updates['antiraid.whitelist'] = current.filter(id => id !== userId);
                else updates['antiraid.whitelist'] = [...current, userId];
            } else if (customId === 'secur_owner_user' && interaction.isUserSelectMenu()) {
                const userId = interaction.values[0];
                const current = settings.owners || [];
                if (current.includes(userId)) updates.owners = current.filter(id => id !== userId);
                else updates.owners = [...current, userId];
            } else if (customId === 'secur_whitelist_clear') {
                updates['antiraid.whitelist'] = [];
                state.notice = '✅ Whitelist vidée.';
            } else if (customId === 'secur_owners_clear') {
                updates.owners = [];
                state.notice = '✅ Owners vidés.';
            } else if (customId === 'secur_logs_setup') {
                await interaction.deferUpdate().catch(() => {});
                if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    state.notice = '❌ Permission `Gérer les salons` manquante.';
                } else {
                    try {
                        const result = await ensureLogsSetup(message.guild, client.user.id);
                        await Guild.updateOne({ guildId }, result.updates);
                        invalidateGuildSettings(client, guildId);
                        settings = await getGuildSettings(client, guildId);
                        state.notice = `✅ Logs : **${result.created}** créés, **${result.reused}** réutilisés.`;
                    } catch {
                        state.notice = '❌ Échec création des logs.';
                    }
                }
                await panelMessage.edit({
                    embeds: [buildEmbed(message.guild, settings, state)],
                    components: buildRows(state),
                }).catch(() => {});
                return;
            } else if (customId === 'secur_logs_here') {
                updates['logs.enabled'] = true;
                updates['logs.securityLogs'] = interaction.channel.id;
            } else if (customId === 'secur_raid_logs_here') {
                updates['logs.enabled'] = true;
                updates['logs.raidLogs'] = interaction.channel.id;
            } else if (customId === 'secur_logs_toggle') {
                updates['logs.enabled'] = !settings.logs?.enabled;
            } else if (customId === 'secur_refresh') {
                // no-op
            }

            if (Object.keys(updates).length) {
                await Guild.updateOne({ guildId }, updates);
                invalidateGuildSettings(client, guildId);
            }

            settings = await getGuildSettings(client, guildId);
            await refresh(interaction, message, state, settings);
        });

        collector.on('end', async () => {
            try {
                const final = await getGuildSettings(client, guildId);
                await panelMessage.edit({
                    embeds: [buildEmbed(message.guild, final, state)],
                    components: [],
                });
            } catch {
                // message deleted or inaccessible
            }
        });
    },
};