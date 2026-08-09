'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'changeall',
    category: 'owners',
    ownerOnly: true,
    description: 'Transfère toutes les commandes d\'une permission vers une autre',
    usage: '<ancienne_perm> <nouvelle_perm>',
    async run(client, message, args) {
        const from = args[0]?.toLowerCase();
        const to = args[1]?.toLowerCase();

        if (!from || !to) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${this.usage}\``)] });
        }

        const allGuilds = await Guild.find({});
        let totalTransfers = 0;

        for (const guild of allGuilds) {
            if (!guild.permissions?.[from]) continue;

            for (const targetId of guild.permissions[from]) {
                await Guild.updateOne(
                    { guildId: guild.guildId },
                    { $addToSet: { [`permissions.${to}`]: targetId } }
                );
                totalTransfers++;
            }

            await Guild.updateOne(
                { guildId: guild.guildId },
                { $unset: { [`permissions.${from}`]: '' } }
            );
        }

        message.channel.send({ embeds: [EmbedHelper.success(`${totalTransfers} entrée(s) transférée(s) de \`${from}\` vers \`${to}\`.`)] });
    },
};
