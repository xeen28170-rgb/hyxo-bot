'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'voicemove',
    category: 'moderation',
    description: 'Déplace tous les membres d\'un salon vocal vers un autre',
    usage: '[salon départ] [salon arrivée]',
    permissions: ['MoveMembers'],
    async run(client, message, args) {
        const from = Helpers.resolveChannel(message.guild, args[0]);
        const to = Helpers.resolveChannel(message.guild, args[1]);

        if (!from || from.type !== 2) return message.channel.send({ embeds: [EmbedHelper.error('Salon de départ invalide.')] });
        if (!to || to.type !== 2) return message.channel.send({ embeds: [EmbedHelper.error('Salon d\'arrivée invalide.')] });

        const members = from.members;
        if (!members.size) return message.channel.send({ embeds: [EmbedHelper.error('Aucun membre dans le salon de départ.')] });

        let count = 0;
        let failed = 0;
        for (const member of members.values()) {
            try { await member.voice.setChannel(to); count++; } catch { failed++; }
        }

        const report = `**${count}** membres déplacés de <#${from.id}> vers <#${to.id}>. **${failed}** échecs.`;
        await message.channel.send({ embeds: [failed ? EmbedHelper.warning(report) : EmbedHelper.success(report)], allowedMentions: { parse: [] } });
    },
};
