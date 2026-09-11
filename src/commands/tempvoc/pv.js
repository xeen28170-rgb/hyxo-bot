'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');
const { getAccessLevel, applyPrivateVoice, LEVEL } = require('../../utils/privateVoice');

module.exports = {
    name: 'pv',
    category: 'tempvoc',
    description: 'Rend le salon vocal dans lequel vous êtes privé.',
    usage: '=pv',
    cooldown: 3,
    async run(client, message) {
        const channel = message.member?.voice?.channel;
        if (!channel) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Vous devez être dans un salon vocal pour utiliser `=pv`.')] });
        }

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const level = await getAccessLevel(client, message.member, settings);

        // Accès : seuls WL, Owner et propriétaire du bot.
        if (level < LEVEL.WL) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Réservé aux membres WL, Owner et au propriétaire du bot.')] });
        }

        const { pv } = await applyPrivateVoice(client, channel, message.member, settings);

        const desc = [
            `**Salon:** <#${channel.id}>`,
            `**Rendu privé par:** ${message.member} (${pv.accessLevel})`,
            '',
            pv.accessLevel === 'Owner' || pv.accessLevel === 'Owner Bot'
                ? '_Personne d\'autre ne peut rejoindre (même les WL et les Owner)._'
                : '_Seuls les membres WL peuvent rejoindre._',
            'Le salon redeviendra public automatiquement dès que vous le quittez.',
        ].join('\n');

        return message.channel.send({ embeds: [EmbedHelper.success('🔒 Salon privé activé', desc)] });
    },
};
