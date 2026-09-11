'use strict';

const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

const HELP_CATEGORIES = {
    security: { label: 'Sécurité', emoji: '🛡️', description: 'Protections antiraid, whitelist et console Protect.', color: 0xED4245 },
    moderation: { label: 'Modération', emoji: '🔨', description: 'Sanctions, rôles, salons et actions de modération.', color: 0xFEE75C },
    logs: { label: 'Logs', emoji: '📜', description: 'Journaux serveur, sécurité, modération et statistiques.', color: 0x57F287 },
    tickets: { label: 'Tickets', emoji: '🎫', description: 'Support, tickets, panels et modmail.', color: 0x5865F2 },
    utility: { label: 'Utilitaires', emoji: '⚙️', description: 'Informations, outils rapides et commandes publiques.', color: 0xEB459E },
    administration: { label: 'Administration', emoji: '👑', description: 'Configuration serveur, rôles, permissions et gestion.', color: 0xF47B67 },
    giveaways: { label: 'Giveaways', emoji: '🎉', description: 'Création, gestion et configuration des giveaways.', color: 0x9B59B6 },
    backups: { label: 'Backups', emoji: '💾', description: 'Sauvegardes et restauration de configuration serveur.', color: 0x1ABC9C },
    tempvoc: { label: 'TempVoc', emoji: '🎤', description: 'Salons vocaux temporaires et gestion.', color: 0xE91E63 },
    ownerbot: { label: 'Owner Bot', emoji: '🔧', description: 'Commandes réservées aux owners du bot.', color: 0x2F3136 },
};

const HELP_COLOR = 0xC41E3A;
const EMBED_DESCRIPTION_LIMIT = 4096;
const HELP_CATEGORY_BY_COMMAND = buildHelpCategoryMap({
    security: [
        'secur',
        'antidown',
        'wl',
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
        'laisse',
        'lock',
        'lockall',
        'massiverole',
        'mute',
        'mutelist',
        'prison',
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
    const usage = (command.usage || '').trim();
    if (!usage) return `${prefix}${command.name}`;
    const noPrefix = usage.replace(/^[+\-!/\\.#@]+\s*/, '');
    return `${prefix}${command.name} ${noPrefix}`.trim();
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

function buildCompactCommandLine(prefix, command, descriptionLength) {
    const description = compactText(command.description || 'Aucune description.', descriptionLength);
    return `\`${formatUsage(prefix, command)}\` — ${description}`;
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
        .setColor(info.color || HELP_COLOR)
        .setTitle(`${info.emoji} ${info.label}`)
        .setDescription(buildSingleCategoryDescription(info, sorted, prefix))
        .setFooter({ text: `${sorted.length} commande${sorted.length > 1 ? 's' : ''} • ${prefix}help <commande> pour plus de détails` })
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

function buildHelpMenuEmbed(client, prefix = '-') {
    const total = client.commands?.size ?? 0;

    const categoryLines = Object.entries(HELP_CATEGORIES).map(([key, info]) => {
        const count = getCommandsForHelpCategory(client, key).size;
        if (count === 0) return null;
        return `${info.emoji} **${info.label}** — \`${count}\` commande${count > 1 ? 's' : ''}`;
    }).filter(Boolean);

    return new EmbedBuilder()
        .setColor(HELP_COLOR)
        .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
        .setTitle('Centre d\'aide')
        .setDescription([
            '> *Trouvez rapidement la commande qu\'il vous faut.*',
            '',
            '┌─────────────────────────────┐',
            ...categoryLines.map(line => `│ ${line}`),
            '└─────────────────────────────┘',
            '',
            `**${total}** commandes au total`,
            '',
            '> Utilisez le menu ci-dessous pour explorer une catégorie.',
            `> Tapez \`${prefix}help <commande>\` pour les détails d'une commande.`,
        ].join('\n'))
        .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
        .setTimestamp();
}

function buildHelpCommandEmbed(client, command, prefix = '-') {
    const categoryKey = classifyCommand(command);
    const info = HELP_CATEGORIES[categoryKey];

    const embed = new EmbedBuilder()
        .setColor(info?.color || HELP_COLOR)
        .setTitle(`${info?.emoji || '📖'} ${command.name}`)
        .setDescription(command.description || 'Aucune description disponible.');

    if (command.usage) {
        const noPrefix = command.usage.replace(/^[+\-!/\\.#@]+\s*/, '');
        embed.addFields({ name: '📝 Usage', value: `\`${prefix}${command.name} ${noPrefix}\``, inline: true });
    }

    if (command.permissions?.length) {
        embed.addFields({ name: '🔑 Permissions', value: command.permissions.map(p => `\`${p}\``).join(', '), inline: true });
    }

    if (command.botPermissions?.length) {
        embed.addFields({ name: '🤖 Permissions Bot', value: command.botPermissions.map(p => `\`${p}\``).join(', '), inline: true });
    }

    if (command.aliases?.length) {
        embed.addFields({ name: '🔗 Aliases', value: command.aliases.map(a => `\`${a}\``).join(', '), inline: true });
    }

    if (command.cooldown) {
        embed.addFields({ name: '⏱️ Cooldown', value: `\`${command.cooldown}s\``, inline: true });
    }

    if (info) {
        embed.addFields({ name: '📂 Catégorie', value: `${info.emoji} ${info.label}`, inline: true });
    }

    embed.setFooter({ text: `${prefix}help — Retour au menu principal` })
        .setTimestamp();

    return embed;
}

function buildHelpSelectRow(client, authorId) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(`help_category_select:${authorId}`)
        .setPlaceholder('📂 Choisir une catégorie')
        .addOptions(
            Object.entries(HELP_CATEGORIES)
                .filter(([key]) => getCommandsForHelpCategory(client, key).size > 0)
                .map(([key, info]) => ({
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
    buildHelpCommandEmbed,
    buildHelpSelectRow,
};
