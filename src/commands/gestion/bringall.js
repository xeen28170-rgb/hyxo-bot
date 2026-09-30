'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { mapLimit } = require('../../utils/concurrency');

module.exports = {
    name: 'bringall',
    category: 'moderation',
    ownerOnly: false,
    description: 'Déplace tous les membres en vocal sur le serveur vers un salon vocal',
    usage: '[salon]',
    permissions: ['MoveMembers'],
    async run(client, message, args) {
        try {
            const to = Helpers.resolveChannel(message.guild, args[0]) || message.member?.voice.channel;
            if (!to || to.type !== 2) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir un salon vocal valide ou être dans un salon.')] });

            const members = message.guild.members.cache.filter(m => m.voice.channel && m.voice.channel.id !== to.id);
            if (!members.size) return message.channel.send({ embeds: [EmbedHelper.error('Aucun membre à déplacer.')] });

            await message.channel.send({ embeds: [EmbedHelper.info('🚀 Déplacement...', `Déplacement de **${members.size}** membres vers <#${to.id}>.`)] });

            const results = await mapLimit([...members.values()], (member) => member.voice.setChannel(to), 5);
            const count = results.filter(r => r.ok).length;
            const failed = results.length - count;

            const report = `**${count}** membres déplacés vers <#${to.id}>. **${failed}** échecs.`;
            await message.channel.send({ embeds: [failed ? EmbedHelper.warning(report) : EmbedHelper.success(report)], allowedMentions: { parse: [] } });
        } catch (err) {
            console.error(err);
            await message.channel.send({ embeds: [EmbedHelper.error(`Une erreur est survenue lors du déplacement : ${err.message}`)] });
        }
    },
};
