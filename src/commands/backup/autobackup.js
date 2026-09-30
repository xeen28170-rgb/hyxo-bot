'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'autobackup',
    category: 'backup',
    description: 'Configure le nombre de jours entre chaque backup automatique',
    usage: '<serveur/emoji> <jours>',
    permissions: ['Administrator'],
    async run(client, message, args) {
        const type = args[0]?.toLowerCase();
        const days = parseInt(args[1]);

        if (!['serveur', 'server', 'emoji'].includes(type) || isNaN(days) || days < 1) {
            return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-autobackup <serveur/emoji> <jours>`\nEx: `-autobackup serveur 7`')] });
        }

        const key = type === 'emoji' ? 'autobackup.emojiInterval' : 'autobackup.serverInterval';
        await Guild.updateOne({ guildId: message.guild.id }, { [key]: days });
        client.cache?.invalidateGuild?.(message.guild.id);

        const label = type === 'emoji' ? 'émojis' : 'serveur';
        await message.channel.send({ embeds: [EmbedHelper.success(`La backup automatique des **${label}** a été configurée tous les **${days} jour(s)**.`)] });
    },
};
