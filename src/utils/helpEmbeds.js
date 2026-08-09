'use strict';

const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

const HELP_CATEGORIES = {
    security: { label: 'Sécurité', emoji: '🛡️', description: 'Protections antiraid, whitelist et console Protect.' },
    moderation: { label: 'Modération', emoji: '🔨', description: 'Sanctions, rôles, salons et actions de modération.' },
    logs: { label: 'Logs', emoji: '📜', description: 'Journaux serveur, sécurité, modération et statistiques.' },
    tickets: { label: 'Tickets', emoji: '🎫', description: 'Support, tickets, panels et modmail.' },
    utility: { label: 'Utilitaires', emoji: '⚙️', description: 'Informations, outils rapides et commandes publiques.' },
    administration: { label: 'Administration', emoji: '👑', description: 'Configuration serveur, rôles, permissions et gestion.' },
    giveaways: { label: 'Giveaways', emoji: '🎉', description: 'Création, gestion et configuration des giveaways.' },
    backups: { label: 'Backups', emoji: '💾', description: 'Sauvegardes et restauration de configuration serveur.' },
    ownerbot: { label: 'Owner Bot', emoji: '👑', description: 'Commandes réservées aux owners du bot.' },
};

const HELP_COLOR = 0xC41E3A;
const EMBED_DESCRIPTION_LIMIT = 4096;
const HELP_CATEGORY_BY_COMMAND = buildHelpCategoryMap({
    security: [
        'secur',
        'blrank',
        'creation',
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
        'lock',
        'lockall',
        'massiverole',
        'mute',
        'mutelist',
        'renew',
        'sanctions',
        'slowmode',
        'sync',
        'temprole',
        'unban',
        'unbanall',
        'uncmute',
        'unhide',
        'unhideall',
        'unlock',
        'unlockall',
        'unmassiverole',
        'unmute',
        'unmuteall',
        'untemprole',
        'voicekick',
        'voicemove',
        'warn',
        'warns',
    ],
    logs: [
        'logs',
        'statschannels',
        'modsettings',
    ],
    tickets: [
        'add',
        'addmember',
        'modmail',
        'openmodmail',
        'rename',
        'ticket',
        'ticket-manage',
        'ticketmanage',
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
        'public',
        'report',
        'restrict',
        'rolemenu',
        'set-perm',
        'setperm',
        'settings',
        'showpics',
        'soutien',
        'tempvoc',
        'timeout',
        'twitch',
        'unrestrict',
    ],
    giveaways: [
        'choose',
        'endgiveaway',
        'giveaway',
        'giveaway-settings',
        'giveawaysettings',
        'reroll',
    ],
    backups: [
        'autobackup',
        'backup',
    ],
    ownerbot: [
        'activity', 'alias', 'blacklist', 'change', 'changeall',
        'clearowners', 'fivem', 'helpalias', 'helptype', 'lang',
        'langcustom', 'mainprefix', 'mp', 'mp-settings', 'owner',
        'reset', 'say', 'secur-invite', 'serverActions', 'serverlist',
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
    const usage = command.usage?.trim();
    if (!usage) return `${prefix}${command.name}`;
    return usage.startsWith(prefix) ? usage : `${prefix}${command.name} ${usage}`.trim();
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
    if (category === 'custom' || category === 'config' || category === 'gestion' || category === 'tempvoc' || category === 'moderation_config') return 'administration';
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

function buildCompactCommandLine(prefix, command, descriptionLength) {
    const description = compactText(command.description || 'Aucune description.', descriptionLength);
    return `\`${formatUsage(prefix, command)}\` - ${description}`;
}

function buildSingleCategoryDescription(info, commands, prefix) {
    for (const descriptionLength of [95, 75, 55, 35]) {
        const lines = commands.map(command => buildCompactCommandLine(prefix, command, descriptionLength));
        const description = `${info.description}\n\n${lines.join('\n')}`;
        if (description.length <= EMBED_DESCRIPTION_LIMIT) return description;
    }

    const names = commands.map(command => `\`${prefix}${command.name}\``);
    const description = `${info.description}\n\n${names.join('  ')}`;
    if (description.length <= EMBED_DESCRIPTION_LIMIT) return description;

    return compactText(description, EMBED_DESCRIPTION_LIMIT);
}

function buildCategoryEmbedArray(commands, categoryKey, prefix, client = null) {
    const info = HELP_CATEGORIES[categoryKey];
    if (!info || !commands.size) return [];

    const sorted = [...commands.values()].sort((left, right) => left.name.localeCompare(right.name));
    const embed = new EmbedBuilder()
        .setColor(HELP_COLOR)
        .setTitle(`${info.emoji} ${info.label}`)
        .setDescription(buildSingleCategoryDescription(info, sorted, prefix))
        .setFooter({ text: `${sorted.length} commande${sorted.length > 1 ? 's' : ''}` })
        .setTimestamp();
    if (client?.user) {
        embed.setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() });
    }
    return [embed];
}

function buildAllCategoryEmbedsFlat(client, prefix) {
    const embeds = [];
    for (const key of Object.keys(HELP_CATEGORIES)) {
        const commands = getCommandsForHelpCategory(client, key);
        if (commands.size) embeds.push(...buildCategoryEmbedArray(commands, key, prefix, client));
    }
    return embeds;
}

function buildHelpMenuEmbed(client) {
    const total = client.commands?.size ?? 0;
    const categoryLines = Object.entries(HELP_CATEGORIES).map(([key, info]) => {
        const count = getCommandsForHelpCategory(client, key).size;
        return `${info.emoji} **${info.label}** — \`${count}\` commande${count > 1 ? 's' : ''}`;
    });

    return new EmbedBuilder()
        .setColor(HELP_COLOR)
        .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
        .setTitle('Centre d’aide Protect')
        .setDescription([
            'Une interface claire pour trouver rapidement les commandes utiles.',
            '',
            categoryLines.join('\n'),
            '',
            `Total: **${total}** commandes disponibles.`,
        ].join('\n'))
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: 'Sélectionne une catégorie dans le menu.' })
        .setTimestamp();
}

function buildHelpSelectRow(client, authorId) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(`help_category_select:${authorId}`)
        .setPlaceholder('Choisir une catégorie')
        .addOptions(
            Object.entries(HELP_CATEGORIES).map(([key, info]) => ({
                label: info.label,
                description: info.description.slice(0, 100),
                emoji: info.emoji,
                value: key,
            }))
        );
    return new ActionRowBuilder().addComponents(select);
}

module.exports = {
    HELP_CATEGORIES,
    HELP_COLOR,
    formatUsage,
    classifyCommand,
    getCommandsForHelpCategory,
    buildCategoryEmbedArray,
    buildAllCategoryEmbedsFlat,
    buildHelpMenuEmbed,
    buildHelpSelectRow,
};
