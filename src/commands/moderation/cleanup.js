'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { mapLimit } = require('../../utils/concurrency');

module.exports = {
    name: 'cleanup',
    category: 'moderation',
    description: 'Déconnecte tous les membres d\'un salon vocal.',
    usage: '-cleanup <salon>',
    permissions: ['MoveMembers'],
    botPermissions: ['MoveMembers'],
    async run(client, message, args) {
        const channel = Helpers.resolveChannel(message.guild, args[0]);
        if (!channel || channel.type !== 2)
            return message.channel.send({ embeds: [EmbedHelper.error('Salon vocal introuvable ou invalide.')] });

        const members = channel.members;
        if (!members.size)
            return message.channel.send({ embeds: [EmbedHelper.error('Le salon est déjà vide.')] });

        const results = await mapLimit([...members.values()], (member) => member.voice.disconnect(), 5);
        const count = results.filter(r => r.ok).length;
        const failed = results.length - count;

        const report = `**${count}** membres déconnectés du salon <#${channel.id}>. **${failed}** échecs.`;
        await message.channel.send({ embeds: [failed ? EmbedHelper.warning(report) : EmbedHelper.success(report)], allowedMentions: { parse: [] } });
    },
};
