'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { helpClient, commandAccess, accessContext } = require('../../utils/commandAccess');
const { expireMenu } = require('../../utils/menuLifetime');
const {
    buildHelpPayload,
    rememberHelpBanner,
    buildHelpSelectRow,
    buildHelpCommandEmbed,
} = require('../../utils/helpEmbeds');

// Comparaison sans accents ni majuscules : « vocal » trouve « Vocal », « bienvenue » trouve « Bienvenué ».
const fold = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Mots que les gens tapent, et les mots employés dans les descriptions des commandes.
const SYNONYMS = {
    bienvenue: ['welcome', 'join', 'arrivee'], arrivee: ['welcome', 'join', 'bienvenue'], welcome: ['bienvenue', 'join', 'arrivee'],
    depart: ['leave', 'quitte'], vocal: ['voice', 'voc', 'tempvoc'], voc: ['vocal', 'voice'],
    log: ['logs'], sanction: ['ban', 'kick', 'mute', 'warn', 'timeout'], mute: ['timeout', 'muet'],
    to: ['timeout', 'mute'], lien: ['link', 'antilink', 'invite'], pub: ['antilink', 'invite'],
    raid: ['antiraid'], securite: ['antiraid', 'secur', 'automod'], role: ['roles'], salon: ['channel', 'salons'],
};

/** Commandes qui parlent du mot cherché : d'abord le nom, puis les alias, puis la description. */
function searchCommands(commands, query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const scored = [];
    for (const command of commands.values()) {
        const name = fold(command.name);
        const aliases = (command.aliases || []).map(fold).join(' ');
        const text = fold(`${command.description} ${command.usage} ${command.category}`);
        const all = `${name} ${aliases} ${text}`;
        // Mot tapé (4 lettres ou plus) : n'importe où. Mot court ou synonyme : en début de mot,
        // sinon « to » trouverait « autobackup » et « join » trouverait « rejoindre ».
        // Mot entier, pluriel accepté : « ban » trouve « bans » mais pas « bannière ».
        const wholeWord = v => new RegExp(`(^|[^a-z0-9])${v.replace(/[^a-z0-9]/g, '')}s?($|[^a-z0-9])`).test(all);
        const matches = w => (w.length > 3 ? all.includes(w) : wholeWord(w)) || (SYNONYMS[w] || []).some(wholeWord);
        if (!words.every(matches)) continue;
        const score = words.reduce((total, w) => total + (name.includes(w) ? 3 : aliases.includes(w) ? 2 : 1), 0);
        scored.push({ command, score });
    }
    return scored.sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name)).map(s => s.command);
}

module.exports = {
    name: 'help',
    category: 'utility',
    description: 'Afficher le menu d\'aide.',
    usage: '-help [commande]',
    async run(client, message, args) {
        const prefix = message.guildSettings?.prefix || client.prefix;
        const filtered = await helpClient(client, message.member, message.guildSettings, message.channelId);

        if (args[0]) {
            const input = args.join(' ').trim().toLowerCase();
            const commandName = input.startsWith(prefix) ? input.slice(prefix.length) : input;
            const aliasTarget = client.aliases.get(commandName);
            const command = client.commands.get(commandName) || (aliasTarget ? client.commands.get(aliasTarget) : null);

            if (!command) {
                // Pas une commande : on cherche toutes celles qui en parlent (« +help boost »).
                const results = searchCommands(filtered.commands || client.commands, commandName);
                if (!results.length) {
                    return message.channel.send({ embeds: [EmbedHelper.error(`Aucune commande ne parle de « ${commandName.slice(0, 50)} ». Retrouvez la liste avec \`${prefix}help\`.`)], allowedMentions: { parse: [] } });
                }
                const lines = results.slice(0, 20).map(c => `\`${c.prefix || prefix}${c.name}\` · ${String(c.description || '').slice(0, 90)}`);
                if (results.length > 20) lines.push(`-# … et ${results.length - 20} autre(s). Précise ta recherche.`);
                const embed = EmbedHelper.info(`Commandes liées à « ${commandName.slice(0, 40)} »`, lines.join('\n'), {
                    footer: `${results.length} résultat(s) · ${prefix}help <commande> pour le détail`,
                });
                return message.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
            }

            const embed = buildHelpCommandEmbed(client, command, prefix);
            const denial = commandAccess(command, await accessContext(client, message.member, message.guildSettings, message.channelId));
            embed.addFields({ name: 'Accès', value: denial || 'Accessible. Les conditions liées à la cible ou au salon restent vérifiées à l’exécution.' });
            const sent = await message.channel.send({ embeds: [embed], components: [buildHelpSelectRow(filtered, message.author.id)], allowedMentions: { parse: [] } });
            expireMenu(sent);
            return sent;
        }

        const sent = await message.channel.send(buildHelpPayload(filtered, prefix, message.author.id));
        rememberHelpBanner(sent);
        expireMenu(sent);
    },
};
