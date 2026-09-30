'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { helpClient, commandAccess, accessContext } = require('../../utils/commandAccess');
const { expireMenu } = require('../../utils/menuLifetime');
const {
    buildHelpPayload,
    buildHelpSelectRow,
    buildHelpCommandEmbed,
} = require('../../utils/helpEmbeds');

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
                return message.channel.send({ embeds: [EmbedHelper.error(`Je ne trouve pas cette commande. Retrouvez la liste avec \`${prefix}help\`.`)], allowedMentions: { parse: [] } });
            }

            const embed = buildHelpCommandEmbed(client, command, prefix);
            const denial = commandAccess(command, await accessContext(client, message.member, message.guildSettings, message.channelId));
            embed.addFields({ name: 'Accès', value: denial || 'Accessible. Les conditions liées à la cible ou au salon restent vérifiées à l’exécution.' });
            const sent = await message.channel.send({ embeds: [embed], components: [buildHelpSelectRow(filtered, message.author.id)], allowedMentions: { parse: [] } });
            expireMenu(sent);
            return sent;
        }

        const sent = await message.channel.send(buildHelpPayload(filtered, prefix, message.author.id));
        expireMenu(sent);
    },
};
