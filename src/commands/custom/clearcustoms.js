'use strict';

const CustomCommand = require('../../models/CustomCommand');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'clearcustoms',
    aliases: ['clear customs'],
    category: 'custom',
    description: 'Supprime toutes les commandes custom du serveur',
    permissions: ['ManageGuild'],
    async run(client, message) {
        const result = await CustomCommand.deleteMany({ guildId: message.guild.id });
        message.channel.send({ embeds: [EmbedHelper.success(`**${result.deletedCount}** commande(s) personnalisée(s) supprimée(s).`)] });
    },
};
