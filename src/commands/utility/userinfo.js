'use strict';

const { EmbedBuilder } = require('discord.js');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'user',
    category: 'utility',
    description: 'Affiche les informations relatives à un utilisateur',
    usage: '[membre]',
    async run(client, message, args) {
        const user = await Helpers.resolveUser(client, args[0], message.guild) || message.author;
        const member = message.guild.members.cache.get(user.id);

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`Infos sur ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 1024 }))
            .addFields(
                { name: 'Nom', value: user.username, inline: true },
                { name: 'ID', value: `\`${user.id}\``, inline: true },
                { name: 'Bot', value: user.bot ? 'Oui' : 'Non', inline: true },
                { name: 'Création', value: Helpers.discordTimestamp(user.createdAt, 'f'), inline: true }
            );

        if (member) {
            embed.addFields(
                { name: 'Arrivée', value: Helpers.discordTimestamp(member.joinedAt, 'f'), inline: true },
                { name: 'Rôles', value: `${member.roles.cache.size - 1}`, inline: true }
            );
        }

        message.channel.send({ embeds: [embed] });
    },
};
