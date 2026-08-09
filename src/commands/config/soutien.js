'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'soutien',
    category: 'config',
    description: 'Donne automatiquement un rôle aux membres ayant un message dans leurs statuts',
    usage: '<@rôle> <message>',
    permissions: ['Administrator'],
    async run(client, message, args) {
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0] || '');
        const statusText = args.slice(1).join(' ');

        if (args[0]?.toLowerCase() === 'off') {
            await Guild.updateOne({ guildId: message.guild.id }, { 'config.soutien': null });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Rôle de soutien désactivé.')] });
        }

        if (!role || !statusText) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${this.usage}\``)] });
        }

        await Guild.updateOne({ guildId: message.guild.id }, {
            'config.soutien': {
                roleId: role.id,
                statusText,
            },
        });
        client.cache.invalidateGuild(message.guild.id);

        message.channel.send({ embeds: [EmbedHelper.success(`Rôle **${role.name}** attribué aux membres ayant "${statusText}" dans leur statut.`)] });
    },
};
