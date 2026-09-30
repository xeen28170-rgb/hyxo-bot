'use strict';

const { EmbedBuilder } = require('discord.js');
const { colors } = require('../config/brand');
const { discordTimestamp } = require('./helpers');

function giveawayEmbed(giveaway, participantCount = 0, winnerIds = null) {
    const ended = winnerIds !== null;
    const embed = new EmbedBuilder()
        .setColor(ended ? colors.SUCCESS : colors.GIVEAWAY)
        .setTitle(('🎉 ' + giveaway.prize).slice(0, 256))
        .setDescription(ended
            ? (winnerIds.length ? 'Le tirage est terminé. Bravo aux gagnants !' : 'Tirage terminé : aucun participant éligible cette fois.')
            : 'Une chance à saisir. Réagissez avec 🎉 pour participer !')
        .addFields(
            { name: 'Participants', value: String(participantCount), inline: true },
            { name: 'Gagnants prévus', value: String(giveaway.winners || 1), inline: true },
            { name: ended ? 'Fin prévue' : 'Temps restant', value: discordTimestamp(giveaway.endsAt, ended ? 'f' : 'R'), inline: true },
            { name: 'Organisé par', value: `<@${giveaway.hostId}>`, inline: true }
        );
    if (giveaway.requirements?.role) embed.addFields({ name: 'Rôle requis', value: `<@&${giveaway.requirements.role}>`, inline: true });
    if (ended && winnerIds.length) embed.addFields({ name: '🏆 Gagnants', value: winnerIds.map(id => `<@${id}>`).join(', ').slice(0, 1024) });
    return embed.setFooter({ text: ended ? 'Giveaway terminé' : 'Retirez votre réaction pour quitter · Éligibilité vérifiée au tirage' });
}

module.exports = { giveawayEmbed };
