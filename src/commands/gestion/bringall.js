'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

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

            let count = 0;
            for (const member of members.values()) {
                await member.voice.setChannel(to).catch(() => {});
                count++;
            }

            await message.channel.send({ embeds: [EmbedHelper.success(`✅ **${count}** membres ont été déplacés.`)] });
        } catch (err) {
            console.error(err);
            await message.channel.send({ embeds: [EmbedHelper.error(`Une erreur est survenue lors du déplacement : ${err.message}`)] });
        }
    },
};

