'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Guild = require('../../models/Guild');

module.exports = {
    name: 'prefix',
    category: 'config',
    description: 'Change le préfixe du bot sur le serveur',
    usage: '<préfixe>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const newPrefix = args[0];
        if (!newPrefix) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir un préfixe.')] });
        if (newPrefix.length > 5) return message.channel.send({ embeds: [EmbedHelper.error('Le préfixe ne peut pas dépasser 5 caractères.')] });

        await Guild.updateOne({ guildId: message.guild.id }, { prefix: newPrefix });
        client.cache.invalidateGuild(message.guild.id);

        message.channel.send({ embeds: [EmbedHelper.success(`Le préfixe a été changé en : **${newPrefix}**`)] });
    },
};
