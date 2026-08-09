'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'banlist',
    category: 'moderation',
    description: 'Affiche la liste des bannissements en cours sur le serveur',
    permissions: ['BanMembers'],
    async run(client, message) {
        const bans = await message.guild.bans.fetch();
        if (!bans.size) return message.channel.send({ embeds: [EmbedHelper.error('Personne n\'est banni.')] });

        const embed = EmbedHelper.info('🔨 Liste des bannissements', bans.map(b => `${b.user.tag} (\`${b.user.id}\`)`).join('\n').slice(0, 2048), { color: 0xFF0000 });
        message.channel.send({ embeds: [embed] });
    },
};
