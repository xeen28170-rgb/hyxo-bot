'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'public',
    category: 'moderation_config',
    description: 'Autorise/interdit les commandes dans certains salons',
    usage: '<on/off> | <allow/deny/reset> [salon]',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        if (!sub)
            return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+public <on/off>` ou `+public <allow/deny/reset> [salon]`')] });

        if (sub === 'on' || sub === 'off') {
            await Guild.updateOne({ guildId: message.guild.id }, { 'moderation.publicCommands': sub === 'on' });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Les commandes publiques sont désormais **${sub === 'on' ? 'autorisées ✅' : 'interdites ❌'}** sur le serveur.`)] });
        }

        if (['allow', 'deny', 'reset'].includes(sub)) {
            const channel = (args[1] && Helpers.resolveChannel(message.guild, args[1])) || message.channel;

            if (sub === 'deny') {
                await Guild.updateOne({ guildId: message.guild.id }, { $addToSet: { 'moderation.restrictedChannels': channel.id } });
                client.cache.invalidateGuild(message.guild.id);
                return message.channel.send({ embeds: [EmbedHelper.success(`Les commandes sont désormais **désactivées** dans **${channel.name}**.`)] });
            }

            if (sub === 'allow' || sub === 'reset') {
                await Guild.updateOne({ guildId: message.guild.id }, { $pull: { 'moderation.restrictedChannels': channel.id } });
                client.cache.invalidateGuild(message.guild.id);
                return message.channel.send({ embeds: [EmbedHelper.success(`Les commandes sont désormais **autorisées** dans **${channel.name}**.`)] });
            }
        }

        message.channel.send({ embeds: [EmbedHelper.error('Usage: `+public <on/off>` ou `+public <allow/deny/reset> [salon]`')] });
    },
};
