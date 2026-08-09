'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'unbanall',
    category: 'gestion',
    description: 'Supprime tous les bannissements du serveur',
    permissions: ['Administrator'],
    async run(client, message) {
        const bans = await message.guild.bans.fetch();
        if (!bans.size) return message.channel.send({ embeds: [EmbedHelper.error('Personne n\'est banni sur ce serveur.')] });

        await message.channel.send({ embeds: [EmbedHelper.info('🔨 Débannissement...', `Débannissement de **${bans.size}** membres en cours.`)] });

        let count = 0;
        for (const ban of bans.values()) {
            await message.guild.members.unban(ban.user.id).catch(() => {});
            count++;
        }

        await message.channel.send({ embeds: [EmbedHelper.success(`✅ **${count}** membres ont été débannis.`)] });
    },
};

