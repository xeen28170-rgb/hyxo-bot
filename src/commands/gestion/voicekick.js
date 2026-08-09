'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'voicekick',
    category: 'gestion',
    description: 'Déconnecte un ou plusieurs membres de leur salon vocal actuel',
    usage: '<membre>',
    permissions: ['MoveMembers'],
    async run(client, message, args) {
        const target = await Helpers.resolveMember(message.guild, args[0]);
        if (!target) return message.channel.send({ embeds: [EmbedHelper.error('Membre introuvable.')] });
        if (!target.voice.channel) return message.channel.send({ embeds: [EmbedHelper.error('Ce membre n\'est pas en vocal.')] });

        await target.voice.disconnect();
        message.channel.send({ embeds: [EmbedHelper.success(`**${target.user.tag}** a été déconnecté du vocal.`)] });
    },
};

