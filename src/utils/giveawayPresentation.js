'use strict';

const { EmbedBuilder } = require('discord.js');
const { colors } = require('../config/brand');
const { getEmoji } = require('../config/emojis');
const { discordTimestamp } = require('./helpers');

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

function giveawayEmbed(giveaway, participantCount = 0, winnerIds = null) {
    const ended = winnerIds !== null;
    const winners = giveaway.winners || 1;
    const host = `<@${giveaway.hostId}>`;
    const lines = ended
        ? [
            winnerIds.length ? `${winnerIds.length > 1 ? 'Gagnants' : 'Gagnant'} : ${winnerIds.map(id => `<@${id}>`).join(', ')}` : 'Aucun participant éligible cette fois.',
            `${plural(participantCount, 'participant')} · offert par ${host}`,
        ]
        : [
            `Fin ${discordTimestamp(giveaway.endsAt, 'R')} · offert par ${host}`,
            `**${plural(participantCount, 'participant')}** · clique sur la réaction pour participer`,
        ];
    if (!ended && giveaway.requirements?.role) lines.push(`Réservé au rôle <@&${giveaway.requirements.role}>`);

    return new EmbedBuilder()
        .setColor(ended ? colors.SUCCESS : 0xEE62AE)
        .setAuthor({ name: ended ? 'Giveaway terminé' : `Giveaway · ${plural(winners, 'gagnant')}` })
        .setTitle(`${getEmoji(ended ? 'TROPHY' : 'GIVEAWAY')} ${giveaway.prize}`.slice(0, 256))
        .setDescription(lines.join('\n').slice(0, 4000));
}

module.exports = { giveawayEmbed };
