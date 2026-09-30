'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { mapLimit } = require('../../utils/concurrency');

module.exports = {
    name: 'unbanall',
    category: 'gestion',
    description: 'Supprime tous les bannissements du serveur',
    permissions: ['Administrator'],
    async run(client, message) {
        const bans = await message.guild.bans.fetch();
        if (!bans.size) return message.channel.send({ embeds: [EmbedHelper.error('Personne n\'est banni sur ce serveur.')] });

        await message.channel.send({ embeds: [EmbedHelper.info('🔨 Débannissement...', `Débannissement de **${bans.size}** membres en cours.`)] });

        const results = await mapLimit([...bans.values()], (ban) => message.guild.members.unban(ban.user.id), 5);
        const count = results.filter(r => r.ok).length;
        const failed = results.length - count;

        const report = `**${count}** membres débannis. **${failed}** échecs.`;
        await message.channel.send({ embeds: [failed ? EmbedHelper.warning(report) : EmbedHelper.success(report)] });
    },
};
