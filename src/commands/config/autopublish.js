'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'autopublish',
    category: 'config',
    description: 'Active/désactive la publication automatique des messages dans les salons d\'annonces',
    usage: '<on/off> [salon]',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const status = args[0]?.toLowerCase();
        if (!['on', 'off'].includes(status))
            return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+autopublish <on/off> [salon]`')] });

        const channel = Helpers.resolveChannel(message.guild, args[1]) || message.channel;

        if (channel.type !== 5) // GuildAnnouncement
            return message.channel.send({ embeds: [EmbedHelper.error('Ce salon n\'est pas un salon d\'annonces. Seuls les salons d\'annonces peuvent utiliser autopublish.')] });

        const enabled = status === 'on';
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const list = settings.config?.autopublishChannels || [];

        if (enabled && !list.includes(channel.id)) {
            list.push(channel.id);
        } else if (!enabled) {
            const idx = list.indexOf(channel.id);
            if (idx !== -1) list.splice(idx, 1);
        }

        await Guild.updateOne({ guildId: message.guild.id }, { 'config.autopublishChannels': list });
        client.cache.invalidateGuild(message.guild.id);

        message.channel.send({ embeds: [EmbedHelper.success(`L'autopublish est maintenant **${enabled ? 'activé ✅' : 'désactivé ❌'}** dans <#${channel.id}>.`)] });
    },
};
