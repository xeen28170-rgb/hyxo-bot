'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const LeashService = require('../../services/leashService');

module.exports = {
    name: 'laisselist',
    category: 'owners',
    description: 'Liste toutes les personnes actuellement tenues en laisse. (Owner du bot uniquement)',
    usage: '=laisselist',
    ownerOnly: true,
    async run(client, message) {
        const leashes = await LeashService.listLeashes();
        if (!leashes.length) {
            return message.channel.send({ embeds: [EmbedHelper.info('🐕 Liste des laisses', 'Aucune personne tenue en laisse pour le moment.')] });
        }

        const lines = leashes.map((leash, index) => {
            const target = `<@${leash.userId}>`;
            const follower = `<@${leash.followerId}>`;
            return `**${index + 1}.** ${target} — en laisse par ${follower}\n\`${leash.forcedNick}\``;
        });

        return message.channel.send({
            embeds: [EmbedHelper.info('🐕 Liste des laisses', lines.join('\n').slice(0, 4000))],
        });
    },
};
