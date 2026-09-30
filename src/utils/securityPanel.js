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
const LogDispatcher = require('./logDispatcher');
const PermissionsHelper = require('./permissions');
const { getEmoji } = require('../config/emojis');
const { ALL_LOG_ENTRIES, ensureLogsSetup } = require('./logConfig');
const { getGuildSettings, invalidateGuildSettings } = require('./guildSettings');

const SECURITY_MODULES = [
    { id: 'antichannel', label: 'Anti Channel', emoji: '📁', help: 'Création, suppression ou modification de salons en masse.' },
    { id: 'antirole', label: 'Anti Role', emoji: '🎭', help: 'Rôles créés/supprimés en masse. Toute permission critique ajoutée à un rôle est annulée immédiatement.' },
    { id: 'antiwebhook', label: 'Anti Webhook', emoji: '🔗', help: 'Création ou modification de webhooks (utilisés pour spammer).' },
    { id: 'antibot', label: 'Anti Bot', emoji: '🤖', help: 'Ajout de bots non autorisés : le bot est expulsé.' },
    { id: 'antiban', label: 'Anti Ban', emoji: '🔨', help: 'Bannissements en masse.' },
    { id: 'antikick', label: 'Anti Kick', emoji: '👢', help: 'Expulsions en masse.' },
    { id: 'antiunban', label: 'Anti Unban', emoji: '🔓', help: 'Débannissements en masse.' },
    { id: 'antiupdate', label: 'Anti Update', emoji: '⚙️', help: 'Modifications du serveur, des emojis et des stickers.' },
    { id: 'antitoken', label: 'Anti Token', emoji: '🔑', help: 'Ajout ou suppression d\'intégrations.' },
    { id: 'antieveryone', label: 'Anti Everyone', emoji: '📢', help: 'Mentions @everyone répétées.' },
    { id: 'antihere', label: 'Anti Here', emoji: '📣', help: 'Mentions @here répétées.' },
    { id: 'antideco', label: 'Anti Deco', emoji: '🎨', help: 'Modifications de membres (pseudos, rôles, timeouts). Rôle critique donné = annulé. MAX déconseillé : punit aussi les modérateurs.' },
    { id: 'blrank', label: 'Blacklisted Rank', emoji: '⛔', help: 'Retire les rôles blacklistés (-blrank) dès qu\'ils sont donnés.', noThreshold: true },
].map(m => ({
    ...m,
    statePath: `antiraid.${m.id}`,
    thresholdPath: m.noThreshold ? null : `antiraid.thresholds.${m.id}`,
    punishmentPath: `antiraid.punishments.${m.id}`,
}));

const LEVELS = [
    { value: 'off', label: 'OFF', emoji: '⚫', help: 'Désactivée' },
    { value: 'on', label: 'ON', emoji: '🟢', help: 'Sanction quand le seuil est atteint' },
    { value: 'max', label: 'MAX', emoji: '🔥', help: 'Sanction dès la première action' },
];

const PUNISHMENTS = [
    { label: 'Derank', value: 'derank', emoji: '📉', description: 'Retire les rôles dangereux' },
    { label: 'Timeout 24h', value: 'timeout', emoji: '⏱️', description: 'Exclusion temporaire' },
    { label: 'Kick', value: 'kick', emoji: '👢', description: 'Expulse du serveur' },
    { label: 'Ban', value: 'ban', emoji: '🔨', description: 'Bannit du serveur' },
];

const PRESETS = {
    standard: { label: 'Standard', emoji: '🛡️', states: () => 'on', notice: 'Préréglage **Standard** : toutes les protections en ON.' },
    fortress: {
        label: 'Forteresse',
        emoji: '🚧',
        // antideco reste en ON : en MAX il punirait les modérateurs.
        states: id => (id === 'antideco' ? 'on' : 'max'),
        extra: guild => ({
            'antiraid.autoLockdown': true,
            'antidown.enabled': true,
            ...(guild.vanityURLCode ? { 'antidown.vanity': guild.vanityURLCode } : {}),
        }),
        notice: 'Préréglage **Forteresse** : protections en MAX, lockdown auto et anti-down activés.',
    },
    off: { label: 'Tout couper', emoji: '⚫', states: () => 'off', notice: 'Toutes les protections sont **désactivées**.' },
};

// ─── Lecture de l'état ───────────────────────────────────────────

function getValue(object, path) {
    return path.split('.').reduce((current, key) => current?.[key], object);
}

const moduleById = id => SECURITY_MODULES.find(m => m.id === id) || SECURITY_MODULES[0];
const levelOf = (settings, m) => {
    const value = getValue(settings, m.statePath);
    return value === 'max' || value === 'on' ? value : 'off';
};
const levelInfo = value => LEVELS.find(l => l.value === value) || LEVELS[0];
const punishmentOf = (settings, m) => getValue(settings, m.punishmentPath) || settings.antiraid?.punishment || 'derank';
const thresholdOf = (settings, m) => (m.thresholdPath ? String(getValue(settings, m.thresholdPath) ?? '3/10s') : null);
const activeCount = settings => SECURITY_MODULES.filter(m => levelOf(settings, m) !== 'off').length;

function nextThreshold(value, delta) {
    if (typeof value === 'number') return Math.max(1, Math.min(100, value + delta));
    const match = String(value ?? '3/10s').match(/^(\d+)(.*)$/);
    const count = match ? parseInt(match[1], 10) : 3;
    return `${Math.max(1, Math.min(100, count + delta))}${match?.[2] || '/10s'}`;
}

/** Score de sécurité + points faibles, pour guider sans lire la doc. */
function securityReport(guild, settings) {
    const checks = [];
    const bot = guild.members.me;

    checks.push([activeCount(settings) >= 10, 'Moins de 10 protections actives.']);
    checks.push([levelOf(settings, moduleById('antibot')) !== 'off', 'Anti Bot désactivé : un bot de nuke peut être ajouté.']);
    checks.push([Boolean(settings.logs?.enabled && settings.logs?.securityLogs), 'Aucun salon de logs sécurité.']);
    checks.push([Boolean(settings.logs?.raidLogs), 'Aucun salon de logs raid.']);

    const above = bot ? guild.roles.cache.filter(r => r.position > bot.roles.highest.position
        && r.permissions.any([PermissionFlagsBits.Administrator, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageRoles])).size : 0;
    checks.push([above === 0, `${above} rôle(s) dangereux au-dessus du bot : il ne pourra pas les sanctionner.`]);

    if (guild.vanityURLCode) {
        checks.push([settings.antidown?.enabled === true, 'Anti-down désactivé alors que le serveur a une URL personnalisée.']);
    }

    const score = checks.filter(([ok]) => ok).length;
    return { score, total: checks.length, weak: checks.filter(([ok]) => !ok).map(([, text]) => text) };
}

// ─── Rendu ───────────────────────────────────────────────────────

const button = (id, label, emoji, style = ButtonStyle.Secondary, disabled = false) => {
    const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
    if (emoji) b.setEmoji(emoji);
    return b;
};
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const backButton = () => button('secur_home', 'Retour', '◀️');

function baseEmbed(title, color = 0x8C78FA) {
    return new EmbedBuilder().setColor(color).setTitle(title);
}

function withNotice(lines, state) {
    return state.notice ? [...lines, '', `> ${state.notice}`] : lines;
}

function renderHome(guild, settings, state) {
    const { score, total, weak } = securityReport(guild, settings);
    const bar = '▰'.repeat(score) + '▱'.repeat(total - score);
    const color = score === total ? 0x3FD39C : score >= total - 2 ? 0xF4B63F : 0xF2475E;

    const lines = [
        `**Score ${score}/${total}**  ${bar}`,
        ...weak.slice(0, 3).map(text => `${getEmoji('WARNING')} ${text}`),
        '',
        ...SECURITY_MODULES.map(m => {
            const level = levelOf(settings, m);
            const detail = level === 'off' ? '' : ` · ${punishmentOf(settings, m)}${thresholdOf(settings, m) && level === 'on' ? ` · ${thresholdOf(settings, m)}` : ''}`;
            return `${levelInfo(level).emoji} ${m.emoji} **${m.label}** — ${levelInfo(level).label}${detail}`;
        }),
    ];

    const embed = baseEmbed(`🛡️ Sécurité · ${guild.name}`, color)
        .setDescription(withNotice(lines, state).join('\n').slice(0, 4000))
        .setFooter({ text: `${activeCount(settings)}/${SECURITY_MODULES.length} protections actives · choisis une protection pour la régler` });

    const components = [
        row(new StringSelectMenuBuilder()
            .setCustomId('secur_module')
            .setPlaceholder('Régler une protection…')
            .addOptions(SECURITY_MODULES.map(m => ({
                label: m.label,
                value: m.id,
                emoji: m.emoji,
                description: `${levelInfo(levelOf(settings, m)).label} · ${m.help}`.slice(0, 100),
            })))),
        row(
            button('secur_preset_standard', PRESETS.standard.label, PRESETS.standard.emoji, ButtonStyle.Success),
            button('secur_preset_fortress', PRESETS.fortress.label, PRESETS.fortress.emoji, ButtonStyle.Danger),
            state.confirm === 'preset_off'
                ? button('secur_preset_off_confirm', 'Confirmer : tout couper', '⚠️', ButtonStyle.Danger)
                : button('secur_preset_off', PRESETS.off.label, PRESETS.off.emoji),
        ),
        row(
            button('secur_page_whitelist', 'Whitelist', '✅'),
            button('secur_page_owners', 'Owners', '👑'),
            button('secur_page_logs', 'Logs', '📜'),
            button('secur_page_antidown', 'Anti-down', '🌐'),
        ),
    ];
    return { embed, components };
}

function renderModule(guild, settings, state) {
    const m = moduleById(state.moduleId);
    const level = levelOf(settings, m);
    const threshold = thresholdOf(settings, m);
    const punishment = punishmentOf(settings, m);

    const lines = [
        m.help,
        '',
        `**Niveau** · ${levelInfo(level).emoji} ${levelInfo(level).label} — ${levelInfo(level).help}`,
        `**Sanction** · ${PUNISHMENTS.find(p => p.value === punishment)?.label || punishment}`,
        threshold ? `**Seuil (mode ON)** · ${threshold.replace('/', ' actions / ')}` : null,
    ].filter(line => line !== null);

    const embed = baseEmbed(`${m.emoji} ${m.label}`, level === 'max' ? 0xF2475E : level === 'on' ? 0x3FD39C : 0xA3ADBA)
        .setDescription(withNotice(lines, state).join('\n'));

    const components = [
        row(...LEVELS.map(l => button(`secur_level_${l.value}`, l.label, l.emoji,
            l.value === level ? ButtonStyle.Primary : ButtonStyle.Secondary))),
        row(new StringSelectMenuBuilder()
            .setCustomId('secur_punishment')
            .setPlaceholder('Sanction')
            .addOptions(PUNISHMENTS.map(p => ({ ...p, default: p.value === punishment })))),
        row(
            button('secur_threshold_down', 'Seuil −', '➖', ButtonStyle.Secondary, !threshold),
            button('secur_threshold_up', 'Seuil +', '➕', ButtonStyle.Secondary, !threshold),
            backButton(),
        ),
    ];
    return { embed, components };
}

function renderMembers(guild, settings, state, canManageOwners) {
    const isOwners = state.page === 'owners';
    const list = (isOwners ? settings.owners : settings.antiraid?.whitelist) || [];
    const lines = [
        isOwners
            ? 'Les owners ont accès à `-secur` et ne sont **jamais** sanctionnés par l\'antiraid.'
            : 'Les membres/rôles whitelistés ne sont **pas** sanctionnés par l\'antiraid (l\'anti-down s\'applique quand même).',
        '',
        list.length ? list.map(id => `• <@${id}> · \`${id}\``).join('\n') : '*Personne pour le moment.*',
    ];
    if (isOwners && !canManageOwners) lines.push('', `${getEmoji('LOCK')} Seul le propriétaire du serveur peut modifier les owners.`);

    const embed = baseEmbed(isOwners ? '👑 Owners du serveur' : '✅ Whitelist antiraid')
        .setDescription(withNotice(lines, state).join('\n').slice(0, 4000));

    const locked = isOwners && !canManageOwners;
    const clearId = isOwners ? 'secur_owners_clear' : 'secur_whitelist_clear';
    const confirming = state.confirm === clearId;
    const components = [
        row(new UserSelectMenuBuilder()
            .setCustomId(isOwners ? 'secur_owner_user' : 'secur_whitelist_user')
            .setPlaceholder('Choisir un membre à ajouter ou retirer')
            .setDisabled(locked)),
        row(
            confirming
                ? button(`${clearId}_confirm`, 'Confirmer : tout vider', '⚠️', ButtonStyle.Danger, locked)
                : button(clearId, 'Tout vider', '🗑️', ButtonStyle.Danger, locked || !list.length),
            backButton(),
        ),
    ];
    return { embed, components };
}

function renderLogs(guild, settings, state) {
    const configured = ALL_LOG_ENTRIES.filter(entry => settings.logs?.[entry.key]).length;
    const channel = id => (id ? `<#${id}>` : `${getEmoji('ERROR')} non configuré`);
    const lines = [
        `**État** · ${settings.logs?.enabled ? '🟢 activés' : '⚫ désactivés'} (${configured}/${ALL_LOG_ENTRIES.length} salons)`,
        `**Sécurité** · ${channel(settings.logs?.securityLogs)}`,
        `**Raid** · ${channel(settings.logs?.raidLogs)}`,
        `**Prison** · ${channel(settings.logs?.prisonLogs)}`,
    ];
    const embed = baseEmbed('📜 Logs de sécurité').setDescription(withNotice(lines, state).join('\n'));
    const components = [
        row(
            button('secur_logs_setup', 'Créer tous les salons', '✨', ButtonStyle.Success),
            button('secur_logs_here', 'Sécurité ici', '🛡️'),
            button('secur_raid_logs_here', 'Raid ici', '🚨'),
        ),
        row(
            button('secur_logs_toggle', settings.logs?.enabled ? 'Désactiver' : 'Activer', settings.logs?.enabled ? '⚫' : '🟢'),
            backButton(),
        ),
    ];
    return { embed, components };
}

function renderAntidown(guild, settings, state) {
    const ad = settings.antidown || {};
    const lines = [
        'Protège l\'URL personnalisée du serveur : toute modification (hors owners du bot) est **annulée** et son auteur **banni**, whitelist comprise.',
        '',
        `**État** · ${ad.enabled ? '🟢 activé' : '⚫ désactivé'}`,
        `**Restauration de l'URL** · ${ad.restore === false ? '⚫ non' : '🟢 oui'}`,
        `**URL protégée** · ${ad.vanity ? `discord.gg/${ad.vanity}` : guild.vanityURLCode ? `discord.gg/${guild.vanityURLCode} (sera verrouillée à l'activation)` : '*le serveur n\'a pas d\'URL personnalisée*'}`,
    ];
    const embed = baseEmbed('🌐 Anti-down', ad.enabled ? 0x3FD39C : 0xA3ADBA).setDescription(withNotice(lines, state).join('\n'));
    const components = [row(
        button('secur_antidown_toggle', ad.enabled ? 'Désactiver' : 'Activer', ad.enabled ? '⚫' : '🟢', ad.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
        button('secur_antidown_restore', ad.restore === false ? 'Restauration : non' : 'Restauration : oui', '🔄'),
        backButton(),
    )];
    return { embed, components };
}

function render(guild, settings, state, canManageOwners) {
    if (state.page === 'module') return renderModule(guild, settings, state);
    if (state.page === 'whitelist' || state.page === 'owners') return renderMembers(guild, settings, state, canManageOwners);
    if (state.page === 'logs') return renderLogs(guild, settings, state);
    if (state.page === 'antidown') return renderAntidown(guild, settings, state);
    return renderHome(guild, settings, state);
}

function payload(guild, settings, state, canManageOwners) {
    const { embed, components } = render(guild, settings, state, canManageOwners);
    return { embeds: [embed], components };
}

// ─── Actions ─────────────────────────────────────────────────────

function withEnabledFlag(settings, updates) {
    updates['antiraid.enabled'] = SECURITY_MODULES.some(m => {
        const next = updates[m.statePath] ?? getValue(settings, m.statePath);
        return next && next !== 'off';
    });
    return updates;
}

function toggleId(list, id) {
    const current = Array.isArray(list) ? list : [];
    return current.includes(id) ? current.filter(x => x !== id) : [...current, id];
}

/** Trace chaque changement de configuration dans les logs sécurité. */
function logChange(guild, user, text) {
    const embed = EmbedHelper.log({
        title: '⚙️ Configuration sécurité modifiée',
        color: 0x8C78FA,
        description: `${text}\n-# par ${user} (\`${user.id}\`)`,
    });
    Promise.resolve(LogDispatcher.security(guild, embed)).catch(() => {});
}

/**
 * Traite un clic. Retourne { updates, notice } ; les champs de `state` sont modifiés sur place.
 */
function handleAction(interaction, guild, settings, state, canManageOwners) {
    const { customId } = interaction;
    const updates = {};
    const previousConfirm = state.confirm;
    state.confirm = null;
    state.notice = null;

    if (customId === 'secur_home') {
        state.page = 'home';
    } else if (customId.startsWith('secur_page_')) {
        state.page = customId.slice('secur_page_'.length);
    } else if (customId === 'secur_module') {
        state.page = 'module';
        state.moduleId = interaction.values[0];
    } else if (customId.startsWith('secur_level_')) {
        const m = moduleById(state.moduleId);
        const value = customId.slice('secur_level_'.length);
        updates[m.statePath] = value;
        withEnabledFlag(settings, updates);
        state.notice = `${m.label} → **${value.toUpperCase()}**.`;
    } else if (customId === 'secur_punishment') {
        const m = moduleById(state.moduleId);
        updates[m.punishmentPath] = interaction.values[0];
        state.notice = `Sanction de ${m.label} → **${interaction.values[0]}**.`;
    } else if (customId === 'secur_threshold_down' || customId === 'secur_threshold_up') {
        const m = moduleById(state.moduleId);
        if (m.thresholdPath) {
            updates[m.thresholdPath] = nextThreshold(getValue(settings, m.thresholdPath), customId.endsWith('_up') ? 1 : -1);
            state.notice = `Seuil de ${m.label} → **${updates[m.thresholdPath]}**.`;
        }
    } else if (customId === 'secur_preset_standard' || customId === 'secur_preset_fortress' || customId === 'secur_preset_off_confirm') {
        const preset = PRESETS[customId.replace('secur_preset_', '').replace('_confirm', '')];
        for (const m of SECURITY_MODULES) updates[m.statePath] = preset.states(m.id);
        Object.assign(updates, preset.extra?.(guild) || {});
        withEnabledFlag(settings, updates);
        state.notice = preset.notice;
    } else if (customId === 'secur_preset_off') {
        state.confirm = 'preset_off';
        state.notice = 'Clique sur **Confirmer** pour couper toutes les protections.';
    } else if (customId === 'secur_whitelist_user') {
        updates['antiraid.whitelist'] = toggleId(settings.antiraid?.whitelist, interaction.values[0]);
        state.notice = `<@${interaction.values[0]}> ${updates['antiraid.whitelist'].includes(interaction.values[0]) ? 'ajouté à' : 'retiré de'} la whitelist.`;
    } else if (customId === 'secur_owner_user' && canManageOwners) {
        updates.owners = toggleId(settings.owners, interaction.values[0]);
        state.notice = `<@${interaction.values[0]}> ${updates.owners.includes(interaction.values[0]) ? 'est maintenant' : 'n\'est plus'} owner.`;
    } else if (customId === 'secur_whitelist_clear' || (customId === 'secur_owners_clear' && canManageOwners)) {
        state.confirm = customId;
        state.notice = 'Clique sur **Confirmer** pour tout vider.';
    } else if (customId === 'secur_whitelist_clear_confirm' && previousConfirm === 'secur_whitelist_clear') {
        updates['antiraid.whitelist'] = [];
        state.notice = 'Whitelist vidée.';
    } else if (customId === 'secur_owners_clear_confirm' && previousConfirm === 'secur_owners_clear' && canManageOwners) {
        updates.owners = [];
        state.notice = 'Owners vidés.';
    } else if (customId === 'secur_logs_here') {
        Object.assign(updates, { 'logs.enabled': true, 'logs.securityLogs': interaction.channel.id });
        state.notice = 'Les logs sécurité seront envoyés ici.';
    } else if (customId === 'secur_raid_logs_here') {
        Object.assign(updates, { 'logs.enabled': true, 'logs.raidLogs': interaction.channel.id });
        state.notice = 'Les logs raid seront envoyés ici.';
    } else if (customId === 'secur_logs_toggle') {
        updates['logs.enabled'] = !settings.logs?.enabled;
    } else if (customId === 'secur_antidown_toggle') {
        const enabled = !settings.antidown?.enabled;
        updates['antidown.enabled'] = enabled;
        if (enabled && guild.vanityURLCode) updates['antidown.vanity'] = guild.vanityURLCode;
        state.notice = `Anti-down ${enabled ? 'activé' : 'désactivé'}.`;
    } else if (customId === 'secur_antidown_restore') {
        updates['antidown.restore'] = settings.antidown?.restore === false;
    }

    return updates;
}

module.exports = {
    SECURITY_MODULES,
    // Exposés pour les tests (rendu et logique sans Discord).
    _internals: { payload, handleAction, securityReport },

    async open(client, message) {
        const guild = message.guild;
        const guildId = guild.id;
        // Owners : seul le propriétaire du serveur ou un owner du bot peut les modifier.
        const canManageOwners = message.author.id === guild.ownerId || PermissionsHelper.isBotOwner(client, message.author.id);
        const state = { page: 'home', moduleId: SECURITY_MODULES[0].id, notice: null, confirm: null };
        let settings = await getGuildSettings(client, guildId);

        const panelMessage = await message.channel.send(payload(guild, settings, state, canManageOwners));
        if (typeof panelMessage.createMessageComponentCollector !== 'function') return;
        const collector = panelMessage.createMessageComponentCollector({ time: 10 * 60 * 1000 });

        collector.on('collect', async (interaction) => {
            try {
                if (interaction.user.id !== message.author.id) {
                    await interaction.reply({ embeds: [EmbedHelper.error('Seul l\'auteur peut utiliser cette console.')], flags: 64 });
                    return;
                }
                collector.resetTimer();

                if (interaction.customId === 'secur_logs_setup') {
                    await interaction.deferUpdate().catch(() => {});
                    state.confirm = null;
                    if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                        state.notice = `${getEmoji('ERROR')} Permission \`Gérer les salons\` manquante.`;
                    } else {
                        try {
                            const result = await ensureLogsSetup(guild, client.user.id);
                            await Guild.updateOne({ guildId }, result.updates);
                            invalidateGuildSettings(client, guildId);
                            state.notice = `Logs : **${result.created.length}** créés, **${result.reused.length}** réutilisés.`;
                            logChange(guild, interaction.user, state.notice);
                        } catch {
                            state.notice = `${getEmoji('ERROR')} Échec de la création des logs.`;
                        }
                    }
                    settings = await getGuildSettings(client, guildId);
                    await panelMessage.edit(payload(guild, settings, state, canManageOwners)).catch(() => {});
                    return;
                }

                const updates = handleAction(interaction, guild, settings, state, canManageOwners);
                if (Object.keys(updates).length) {
                    await Guild.updateOne({ guildId }, updates);
                    invalidateGuildSettings(client, guildId);
                    logChange(guild, interaction.user, state.notice || `Réglage modifié : ${Object.keys(updates).join(', ')}`);
                }

                settings = await getGuildSettings(client, guildId);
                await interaction.update(payload(guild, settings, state, canManageOwners));
            } catch (error) {
                // Jamais de rejet non géré (ex: Unknown interaction si l'interaction a expiré).
                const notice = { embeds: [EmbedHelper.error(`Erreur : ${error.message}`)], flags: 64 };
                try {
                    if (interaction.deferred || interaction.replied) await interaction.followUp(notice);
                    else await interaction.reply(notice);
                } catch { /* interaction expirée */ }
            }
        });

        collector.on('end', async () => {
            try {
                const final = await getGuildSettings(client, guildId);
                state.page = 'home';
                state.confirm = null;
                state.notice = 'Console fermée (inactivité). Relance `-secur` pour modifier.';
                await panelMessage.edit({ ...payload(guild, final, state, canManageOwners), components: [] });
            } catch {
                // message supprimé ou inaccessible
            }
        });
    },
};
