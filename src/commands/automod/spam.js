'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'spam',
    category: 'automod',
    description: 'Désactive ou active l\'antispam sur un salon spécifique',
    usage: '<allow/deny/reset> [salon]',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        if (!sub || !['allow', 'deny', 'reset'].includes(sub))
            return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-spam <allow/deny/reset> [salon]`')] });

        const channel = (args[1] && Helpers.resolveChannel(message.guild, args[1])) || message.channel;

        if (sub === 'deny') {
            await Guild.updateOne({ guildId: message.guild.id }, { $addToSet: { 'automod.antispam.ignoredChannels': channel.id } });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`L'antispam est désormais **désactivé** sur **${channel.name}**.`)] });
        }

        if (sub === 'allow' || sub === 'reset') {
            await Guild.updateOne({ guildId: message.guild.id }, { $pull: { 'automod.antispam.ignoredChannels': channel.id } });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`L'antispam est désormais **${sub === 'allow' ? 'activé' : 'synchronisé avec l\'état global'}** sur **${channel.name}**.`)] });
        }
    },
};
