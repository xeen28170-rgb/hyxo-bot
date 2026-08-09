'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'changelogs',
    category: 'utility',
    description: 'Affiche les dernières notes de mise à jour',
    async run(client, message) {
        const embed = EmbedHelper.info('🚀 Notes de mise à jour - v2.0.0', [
            '**Modifications récentes :**',
            '• Refonte complète de l\'interface d\'aide.',
            '• Ajout de nouvelles commandes de gestion serveur.',
            '• Optimisation du système d\'Antiraid global.',
            '• Nouveau système de Giveaway par réactions.',
            '• Simplification des commandes de modération.',
        ].join('\n'), { color: 0xFF0000 });

        await message.channel.send({ embeds: [embed] });
    },
};
