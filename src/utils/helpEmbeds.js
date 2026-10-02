'use strict';

const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const HELP_CATEGORIES = {
    security: { label: 'Sécurité', emoji: '🛡️', description: 'Protections antiraid, whitelist et console Protect.', color: 0x8C78FA },
    moderation: { label: 'Modération', emoji: '🔨', description: 'Sanctions, rôles, salons et actions de modération.', color: 0xF2475E },
    logs: { label: 'Logs', emoji: '📜', description: 'Journaux serveur, sécurité, modération et statistiques.', color: 0xA3ADBA },
    tickets: { label: 'Tickets', emoji: '🎫', description: 'Support, tickets, panels et modmail.', color: 0x4F95F5 },
    utility: { label: 'Utilitaires', emoji: '⚙️', description: 'Informations, outils rapides et commandes publiques.', color: 0x2EC4D6 },
    administration: { label: 'Administration', emoji: '👑', description: 'Configuration serveur, rôles, permissions et gestion.', color: 0xF4B63F },
    giveaways: { label: 'Giveaways', emoji: '🎉', description: 'Création, gestion et configuration des giveaways.', color: 0xEE62AE },
    backups: { label: 'Backups', emoji: '💾', description: 'Sauvegardes et restauration de configuration serveur.', color: 0x3FD39C },
    tempvoc: { label: 'TempVoc', emoji: '🎤', description: 'Salons vocaux temporaires et gestion.', color: 0x2EC4D6 },
    ownerbot: { label: 'Owner Bot', emoji: '🔧', description: 'Commandes réservées aux owners du bot.', color: 0x737B87 },
};

const HELP_COLOR = 0x8C78FA;
const { getEmoji } = require('../config/emojis');
// Commandes mises en avant sur l'accueil (affichées seulement si elles existent).
const SHORTCUTS = ['secur', 'logs', 'tempvoc', 'ticket', 'giveaway', 'backup'];
const PAGE_SIZE = 6;
const HELP_CATEGORY_BY_COMMAND = buildHelpCategoryMap({
    security: [
        'secur',
        'antidown',
        'wl',
        'blrank',
        'creation',
        'honeypot',
        'raidping',
        'lockdown',
        'antispam',
        'antilink',
        'antimassmention',
        'badwords',
        'link',
        'spam',
        'piconly',
        'punish',
        'strikes',
        'ancien',
        'noderank',
    ],
    moderation: [
        'addrole',
        'ban',
        'banlist',
        'bringall',
        'cleanup',
        'clear',
        'cmute',
        'delrole',
        'derank',
        'global-lock',
        'hide',
        'hideall',
        'kick',
        'laisse',
        'lock',
        'lockall',
        'massiverole',
        'mute',
        'mutelist',
        'prison',
        'prisonlist',
        'public',
        'renew',
        'sanctions',
        'slowmode',
        'sync',
        'temprole',
        'timeout',
        'unban',
        'unbanall',
        'uncmute',
        'unhide',
        'unhideall',
        'unlaisse',
        'unlock',
        'unlockall',
        'unmassiverole',
        'unmute',
        'unmuteall',
        'unprison',
        'unprisonall',
        'untemprole',
        'voicekick',
        'voicemove',
        'warn',
        'warns',
    ],
    logs: [
        'statsconfig',
        'modsettings',
    ],
    tickets: [
        'add',
        'modmail',
        'openmodmail',
        'rename',
        'ticket',
        'ticket-manage',
    ],
    utility: [
        'alladmins',
        'allbots',
        'banner',
        'boosters',
        'botadmins',
        'calc',
        'changelogs',
        'channel',
        'help',
        'image',
        'invite',
        'loading',
        'member',
        'pic',
        'ping',
        'remind',
        'role',
        'rolemembers',
        'server',
        'snipe',
        'stats',
        'suggestion',
        'support',
        'user',
        'vocinfo',
        'vstats',
        'wiki',
    ],
    administration: [
        'advancedconfig',
        'autodelete',
        'autopublish',
        'autoreact',
        'button',
        'clearlimit',
        'clearcustoms',
        'config',
        'create',
        'custom',
        'customlist',
        'customtransfer',
        'embed',
        'emoji',
        'formulaire',
        'join-settings',
        'muterole',
        'newsticker',
        'perms',
        'prefix',
        'report',
        'restrict',
        'rolemenu',
        'set-perm',
        'setperm',
        'settings',
        'showpics',
        'soutien',
        'tempvoc',
        'twitch',
        'unrestrict',
    ],
    giveaways: [
        'choose',
        'endgiveaway',
        'giveaway',
        'giveaway-settings',
        'reroll',
    ],
    backups: [
        'autobackup',
        'backup',
    ],
    ownerbot: [
        'activity', 'alias', 'bl', 'change', 'changeall',
        'clearowners', 'fivem', 'helpalias', 'helptype', 'lang',
        'langcustom', 'mainprefix', 'mp', 'mp-settings', 'owner',
        'reset', 'say', 'secur-invite', 'server-action', 'serverlist',
        'set', 'status', 'theme', 'updatebot',
    ],
});

function buildHelpCategoryMap(groups) {
    const map = new Map();
    for (const [category, names] of Object.entries(groups)) {
        for (const name of names) map.set(name, category);
    }
    return map;
}

function formatUsage(prefix, command) {
    const usage = (command.usage || '').trim();
    if (!usage) return prefix + command.name;
    const bare = usage.replace(/^[=+\-!/\\.#@]+\s*/, '');
    const names = [command.name, ...(command.aliases || [])].sort((a, b) => b.length - a.length);
    const name = names.find(value => bare === value || bare.startsWith(value + ' '));
    return name ? prefix + bare : prefix + command.name + ' ' + bare;
}

function classifyCommand(command) {
    if (command.helpCategory && HELP_CATEGORIES[command.helpCategory]) return command.helpCategory;

    const category = command.category;
    const name = command.name;

    if (category === 'owners') return 'ownerbot';
    if (HELP_CATEGORY_BY_COMMAND.has(name)) return HELP_CATEGORY_BY_COMMAND.get(name);
    if (category === 'logs') return 'logs';
    if (category === 'automod' || category === 'antiraid') return 'security';
    if (category === 'moderation') return 'moderation';
    if (['backup', 'autobackup'].includes(name) || category === 'backup') return 'backups';
    if (category === 'tickets') return 'tickets';
    if (category === 'giveaway') return 'giveaways';
    if (category === 'tempvoc') return 'tempvoc';
    if (category === 'custom' || category === 'config' || category === 'gestion' || category === 'moderation_config') return 'administration';
    return 'utility';
}

function getCommandsForHelpCategory(client, categoryKey) {
    return client.commands.filter(command => classifyCommand(command) === categoryKey);
}

function compactText(value, maxLength) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function buildCategoryEmbedArray(commands, categoryKey, prefix, client = null) {
    const info = HELP_CATEGORIES[categoryKey];
    if (!info || !commands.size) return [];
    const sorted = [...commands.values()].sort((a, b) => a.name.localeCompare(b.name));
    const pages = [];
    const total = Math.ceil(sorted.length / PAGE_SIZE);
    for (let offset = 0; offset < sorted.length; offset += PAGE_SIZE) {
        // Une commande = nom en gras + description, puis l'usage en petit texte discret.
        const entries = sorted.slice(offset, offset + PAGE_SIZE).map(command => [
            `${getEmoji('ARROW_RIGHT')} **${prefix}${command.name}** — ${compactText(command.description || 'Aucune description.', 160)}`,
            `-# ${code(compactText(formatUsage(prefix, command), 300))}`,
        ].join('\n'));
        const embed = new EmbedBuilder()
            .setColor(info.color || HELP_COLOR)
            .setAuthor({ name: (client?.user?.username || 'Hyxo') + ' · Centre d’aide' })
            .setTitle(info.emoji + ' ' + info.label)
            .setDescription([`*${info.description}*`, '', ...entries.flatMap(entry => [entry, ''])].join('\n').trim())
            .setFooter({ text: 'Page ' + (pages.length + 1) + '/' + total + ' · ' + sorted.length + ' commande' + (sorted.length > 1 ? 's' : '') + ' · ' + prefix + 'help <commande> pour le détail' });
        pages.push(embed);
    }
    return pages;
}

function code(value) {
    return '\u0060' + String(value).replace(/\u0060/g, '') + '\u0060';
}

function buildAllCategoryEmbedsFlat(client, prefix) {
    return Object.keys(HELP_CATEGORIES).flatMap(key =>
        buildCategoryEmbedArray(getCommandsForHelpCategory(client, key), key, prefix, client));
}

function buildHelpMenuEmbed(client, prefix = '-') {
    const categories = Object.entries(HELP_CATEGORIES).flatMap(([key, info]) => {
        const count = getCommandsForHelpCategory(client, key).size;
        return count ? [`${info.emoji} **${info.label}** · \`${count}\`\n-# ${info.description}`] : [];
    });
    const available = new Set(client.commands?.map?.(command => command.name) || []);
    const shortcuts = SHORTCUTS.filter(name => available.has(name)).map(name => code(prefix + name));

    const embed = new EmbedBuilder()
        .setColor(HELP_COLOR)
        .setAuthor({ name: client.user.username + ' · Centre d’aide' })
        .setTitle(getEmoji('SPARKLES') + ' On fait quoi aujourd’hui ?')
        .setDescription([
            `Préfixe ${code(prefix)} · **${client.commands?.size ?? 0}** commandes disponibles pour toi.`,
            'Choisis une catégorie dans le menu ci-dessous.',
            '',
            categories.join('\n') || 'Aucune commande accessible dans ce salon.',
        ].join('\n'))
        .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: prefix + 'help <commande> pour la fiche détaillée d’une commande' });
    if (shortcuts.length) embed.addFields({ name: getEmoji('BOLT') + ' Raccourcis', value: shortcuts.join(' · ') });
    return embed;
}

const PERMISSION_LABELS = {
    Administrator: 'Administrateur', ManageGuild: 'Gérer le serveur',
    ManageRoles: 'Gérer les rôles', ManageChannels: 'Gérer les salons',
    ManageMessages: 'Gérer les messages', BanMembers: 'Bannir des membres',
    KickMembers: 'Expulser des membres', ModerateMembers: 'Exclure temporairement',
    MoveMembers: 'Déplacer des membres', MuteMembers: 'Rendre muet',
    DeafenMembers: 'Rendre sourd', ViewAuditLog: 'Voir les logs du serveur',
    SendMessages: 'Envoyer des messages', EmbedLinks: 'Intégrer des liens',
    AttachFiles: 'Joindre des fichiers', ReadMessageHistory: 'Voir les anciens messages',
    ViewChannel: 'Voir le salon', Connect: 'Se connecter', Speak: 'Parler',
};

function permissionList(permissions) {
    return compactText(permissions.map(p => PERMISSION_LABELS[p] || String(p)).join(' · '), 1024);
}

function buildHelpCommandEmbed(client, command, prefix = '-') {
    const info = HELP_CATEGORIES[classifyCommand(command)];
    const { EXAMPLES } = require('./commandPresentation');
    const access = command.ownerOnly ? 'Owners du bot'
        : command.serverOwnerOnly ? 'Propriétaire du serveur et owners'
            : command.permissions?.length ? permissionList(command.permissions) : 'Tout le monde';

    const embed = new EmbedBuilder()
        .setColor(info.color || HELP_COLOR)
        .setAuthor({ name: info.emoji + ' ' + info.label + ' · Centre d’aide' })
        .setTitle(getEmoji('SEARCH') + ' ' + prefix + command.name)
        .setDescription(compactText(command.description || 'Aucune description disponible.', 1500))
        .addFields({ name: getEmoji('NOTE') + ' Utilisation', value: code(compactText(formatUsage(prefix, command), 1000)) });
    if (EXAMPLES[command.name]) embed.addFields({ name: getEmoji('STAR') + ' Exemple', value: code(prefix + EXAMPLES[command.name]) });
    embed.addFields({ name: getEmoji('LOCK') + ' Accès', value: access });
    if (command.botPermissions?.length) embed.addFields({
        name: getEmoji('ROBOT') + ' Le bot a besoin de', value: permissionList(command.botPermissions),
    });
    if (command.aliases?.length) embed.addFields({
        name: getEmoji('LINK') + ' Alias', value: compactText(command.aliases.map(a => code(prefix + a)).join(' · '), 1024),
    });
    if (command.cooldown) embed.addFields({
        name: getEmoji('CLOCK') + ' Délai', value: command.cooldown + ' s entre deux usages',
    });
    embed.setFooter({ text: prefix + 'help pour revenir au menu' });
    return embed;
}

function buildHelpSelectRow(client, authorId, category = 'home', all = false) {
    const select = new StringSelectMenuBuilder()
        .setCustomId('help_category_select:' + authorId + ':' + (all ? 'all' : 'mine'))
        .setPlaceholder('Choisir une catégorie')
        .addOptions({ label: 'Accueil', emoji: '🏠', value: 'home', default: category === 'home' },
            ...Object.entries(HELP_CATEGORIES)
                .filter(([key]) => getCommandsForHelpCategory(client, key).size > 0)
                .map(([key, info]) => ({
                    label: info.label, description: info.description.slice(0, 100),
                    emoji: info.emoji, value: key, default: category === key,
                })));
    return new ActionRowBuilder().addComponents(select);
}

function buildHelpPayload(client, prefix, authorId, category = 'home', requestedPage = 0, all = false) {
    if (category !== 'home' && !getCommandsForHelpCategory(client, category).size) category = 'home';
    const pages = category === 'home' ? [buildHelpMenuEmbed(client, prefix)]
        : buildCategoryEmbedArray(getCommandsForHelpCategory(client, category), category, prefix, client);
    if (!pages.length) throw new Error('Catégorie vide ou inconnue.');
    const page = Math.max(0, Math.min(Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 0, pages.length - 1));
    const components = [buildHelpSelectRow(client, authorId, category, all)];
    const toggle = new ButtonBuilder().setCustomId('help_mode:' + authorId + ':' + (all ? 'mine' : 'all'))
        .setLabel(all ? 'Mes commandes' : 'Tout voir').setEmoji(all ? '👤' : '👥').setStyle(ButtonStyle.Secondary);
    if (category !== 'home') {
        const button = (target, index, emoji, label, disabled = false) => new ButtonBuilder()
            .setCustomId('help_page:' + authorId + ':' + target + ':' + index + ':' + (all ? 'all' : 'mine'))
            .setStyle(ButtonStyle.Secondary).setEmoji(emoji).setLabel(label).setDisabled(disabled);
        components.push(new ActionRowBuilder().addComponents(
            button('home', 0, '🏠', 'Accueil'),
            button(category, page - 1, '◀️', 'Précédent', page === 0),
            button(category, page + 1, '▶️', 'Suivant', page === pages.length - 1), toggle
        ));
    } else {
        components.push(new ActionRowBuilder().addComponents(toggle));
    }
    const footer = pages[page].data.footer?.text || '';
    pages[page].setFooter({ text: footer + (all ? ' · Tout le répertoire' : ' · Selon vos accès') });
    return { embeds: [pages[page]], components, allowedMentions: { parse: [] } };
}

module.exports = {
    HELP_CATEGORIES, HELP_COLOR, formatUsage, classifyCommand, getCommandsForHelpCategory,
    buildCategoryEmbedArray, buildAllCategoryEmbedsFlat, buildHelpMenuEmbed,
    buildHelpCommandEmbed, buildHelpSelectRow, buildHelpPayload,
};
