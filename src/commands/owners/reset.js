'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Guild = require('../../models/Guild');
const PermissionsHelper = require('../../utils/permissions');

module.exports = {
    name: 'reset',
    category: 'owners',
    ownerOnly: true,
    description: 'Réinitialise les paramètres du bot',
    usage: '<server/all>',
    async run(client, message, args) {
        if (!PermissionsHelper.isBotOwner(client, message.author.id)) return;
        const sub = args[0]?.toLowerCase();

        if (sub === 'server') {
            await Guild.findOneAndDelete({ guildId: message.guild.id });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Tous les paramètres de ce serveur ont été réinitialisés.')] });
        }

        if (sub === 'all' || message.content.includes('resetall')) {
            await Guild.deleteMany({});
            client.cache.guilds.clear();
            client.cache.permissions.clear();
            return message.channel.send({ embeds: [EmbedHelper.success('L\'ensemble des paramètres du bot a été réinitialisé.')] });
        }

        const prefix = message.guildSettings?.prefix || client.prefix;
        message.channel.send({ embeds: [EmbedHelper.info('⚠️ Réinitialisation', `\`${prefix}reset server\` — Réinitialise ce serveur\n\`${prefix}reset all\` — Réinitialise TOUT`, { color: 0xFF0000 })] });
    },
};
