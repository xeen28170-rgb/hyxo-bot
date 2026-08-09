'use strict';

const CustomCommand = require('../../models/CustomCommand');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'customtransfer',
    aliases: ['custom transfer'],
    category: 'custom',
    description: 'Permet de transférer une commande custom depuis un autre serveur vers celui-ci',
    usage: '<ID/nombre>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sourceId = args[0];
        if (!sourceId) return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+custom transfer <ID du serveur source>`')] });

        const sourceGuild = client.guilds.cache.get(sourceId);
        if (!sourceGuild) return message.channel.send({ embeds: [EmbedHelper.error('Serveur introuvable ou le bot n\'y est pas présent.')] });
        if (sourceId === message.guild.id) return message.channel.send({ embeds: [EmbedHelper.error('Vous ne pouvez pas transférer depuis le même serveur.')] });

        const cmds = await CustomCommand.find({ guildId: sourceId });
        if (!cmds.length) return message.channel.send({ embeds: [EmbedHelper.error('Aucune commande custom trouvée sur ce serveur.')] });

        let transferred = 0;
        for (const cmd of cmds) {
            await CustomCommand.findOneAndUpdate(
                { guildId: message.guild.id, name: cmd.name },
                { response: cmd.response, createdBy: message.author.id, embed: cmd.embed },
                { upsert: true }
            );
            transferred++;
        }

        message.channel.send({ embeds: [EmbedHelper.success(`**${transferred}** commande(s) transférée(s) depuis **${sourceGuild.name}**.`)] });
    },
};
