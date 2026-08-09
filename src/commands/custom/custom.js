'use strict';

const CustomCommand = require('../../models/CustomCommand');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'custom',
    category: 'custom',
    description: 'Gérer les commandes personnalisées.',
    usage: '+custom <add|del|list> <nom> [réponse]',
    permissions: ['ManageGuild'],
    cooldown: 5,
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'add') {
            const name = args[1]?.toLowerCase();
            let response = args.slice(2).join(' ');

            if (!name || !response) return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+custom add <nom> <réponse>`')] });
            
            let isEmbed = false;
            if (response.startsWith('{') && response.endsWith('}')) {
                try {
                    JSON.parse(response);
                    isEmbed = true;
                } catch {
                    isEmbed = false;
                }
            }

            await CustomCommand.findOneAndUpdate(
                { guildId: message.guild.id, name },
                { response, createdBy: message.author.id, embed: isEmbed },
                { upsert: true }
            );

            return message.channel.send({ embeds: [EmbedHelper.success(`La commande \`${name}\` a été ajoutée (Type: ${isEmbed ? 'Embed' : 'Texte'}).`)] });
        }

        if (sub === 'del') {
            const name = args[1]?.toLowerCase();
            const deleted = await CustomCommand.findOneAndDelete({ guildId: message.guild.id, name });
            if (!deleted) return message.channel.send({ embeds: [EmbedHelper.error('Commande introuvable.')] });
            return message.channel.send({ embeds: [EmbedHelper.success(`La commande \`${name}\` a été supprimée.`)] });
        }

        if (sub === 'list') {
            const cmds = await CustomCommand.find({ guildId: message.guild.id });
            const embed = EmbedHelper.info('✨ Commandes personnalisées', cmds.map(c => `\`${c.name}\``).join(', ') || 'Aucune commande.');
            return message.channel.send({ embeds: [embed] });
        }

        return message.channel.send({ embeds: [EmbedHelper.info('✨ Custom — Aide', '`+custom add <nom> <réponse>`\n`+custom del <nom>`\n`+custom list`')] });
    },
};

