'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'ancien',
    category: 'automod',
    description: 'Définit au bout de combien de temps sur le serveur le membre est considéré comme ancien',
    usage: '<durée>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const dureeStr = args[0];
        if (!dureeStr)
            return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-ancien <durée>` (ex: 7j, 30j)')] });

        const dureeMs = Helpers.parseDuration(dureeStr);
        if (!dureeMs)
            return message.channel.send({ embeds: [EmbedHelper.error('Durée invalide. Exemple: `7j`, `30j`, `2w`')] });

        await Guild.updateOne({ guildId: message.guild.id }, { 'automod.ancienDuration': dureeMs });
        client.cache.invalidateGuild(message.guild.id);
        message.channel.send({ embeds: [EmbedHelper.success(`Un membre sera considéré comme **ancien** après **${dureeStr}** sur le serveur.`)] });
    },
};
