'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'rolemembers',
    category: 'utility',
    description: 'Affiche la liste des membres ayant un rôle précis',
    usage: '<rôle>',
    async run(client, message, args) {
        const role = Helpers.resolveRole(message.guild, args.join(' '));
        if (!role) return message.channel.send({ embeds: [EmbedHelper.error('Rôle introuvable.')] });

        const members = role.members;
        const embed = EmbedHelper.info(`👥 Membres avec le rôle ${role.name}`, members.map(m => `${m.user.tag} (\`${m.id}\`)`).join('\n').slice(0, 2048) || 'Aucun membre.', { color: 0xFF0000 });
        message.channel.send({ embeds: [embed] });
    },
};
