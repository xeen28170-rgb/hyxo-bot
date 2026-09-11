'use strict';

const TwitchAlert = require('../../models/TwitchAlert');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'twitch',
    category: 'config',
    description: 'Régler des alertes Twitch.',
    usage: '-twitch <add/del/list> [username] [#channel]',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'add') {
            const username = args[1]?.toLowerCase();
            const channel = Helpers.resolveChannel(message.guild, args[2]) || message.channel;

            if (!username) return message.channel.send({ embeds: [EmbedHelper.error('❌ Usage: `-twitch add <username> [#channel]`')] });

            try {
                await TwitchAlert.findOneAndUpdate(
                    { guildId: message.guild.id, streamerName: username },
                    { channelId: channel.id },
                    { upsert: true }
                );
                return message.channel.send({ embeds: [EmbedHelper.success(`✅ Alerte ajoutée pour **${username}** dans ${channel}.`)] });
            } catch {
                return message.channel.send({ embeds: [EmbedHelper.error('❌ Une erreur est survenue lors de l\'ajout de l\'alerte.')] });
            }
        }

        if (sub === 'del' || sub === 'remove' || sub === 'delete') {
            const username = args[1]?.toLowerCase();
            if (!username) return message.channel.send({ embeds: [EmbedHelper.error('❌ Usage: `-twitch del <username>`')] });

            const deleted = await TwitchAlert.findOneAndDelete({ guildId: message.guild.id, streamerName: username });
            if (!deleted) return message.channel.send({ embeds: [EmbedHelper.error('❌ Aucune alerte trouvée pour ce streamer.')] });

            return message.channel.send({ embeds: [EmbedHelper.success(`✅ Alerte supprimée pour **${username}**.`)] });
        }

        if (sub === 'list') {
            const alerts = await TwitchAlert.find({ guildId: message.guild.id });
            if (!alerts.length) return message.channel.send({ embeds: [EmbedHelper.info('🎥 Twitch', 'Aucune alerte configurée sur ce serveur.')] });

            const list = alerts.map(a => `• **${a.streamerName}** dans <#${a.channelId}>`).join('\n');
            return message.channel.send({ embeds: [EmbedHelper.info('🎥 Alertes Twitch', list)] });
        }

        return message.channel.send({ embeds: [EmbedHelper.info('🎥 Twitch', 'Configurez vos alertes de stream ici.\n\n`-twitch add <username> [#salon]`\n`-twitch del <username>`\n`-twitch list`', { color: 0xFF0000 })] });
    },
};
