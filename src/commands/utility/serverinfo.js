'use strict';

const { EmbedBuilder } = require('discord.js');
const Helpers = require('../../utils/helpers');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'server',
    category: 'utility',
    description: 'Informations relatives au serveur',
    usage: '[pic/banner]',
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'pic' || sub === 'icon') {
            const icon = message.guild.iconURL({ dynamic: true, size: 1024 });
            if (!icon) return message.channel.send({ embeds: [EmbedHelper.error('Ce serveur n\'a pas d\'icône.')] });
            const embed = EmbedHelper.info(`📸 Icône de ${message.guild.name}`, `[Lien de l'image](${icon})`, { color: 0xFF0000 });
            embed.setImage(icon);
            return message.channel.send({ embeds: [embed] });
        }

        if (sub === 'banner') {
            const banner = message.guild.bannerURL({ size: 1024 });
            if (!banner) return message.channel.send({ embeds: [EmbedHelper.error('Ce serveur n\'a pas de bannière.')] });
            const embed = EmbedHelper.info(`🖼️ Bannière de ${message.guild.name}`, `[Lien de l'image](${banner})`, { color: 0xFF0000 });
            embed.setImage(banner);
            return message.channel.send({ embeds: [embed] });
        }

        const guild = message.guild;
        const owner = await guild.fetchOwner();
        const channels = guild.channels.cache;
        
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 1024 }))
            .addFields(
                { name: 'Propriétaire', value: `${owner.user.tag} (\`${owner.id}\`)`, inline: true },
                { name: 'Membres', value: `${guild.memberCount}`, inline: true },
                { name: 'Boosts', value: `${guild.premiumSubscriptionCount} (Niv. ${guild.premiumTier})`, inline: true },
                { name: 'Salons', value: `${channels.size}`, inline: true },
                { name: 'Rôles', value: `${guild.roles.cache.size}`, inline: true },
                { name: 'Création', value: `${Helpers.discordTimestamp(guild.createdAt, 'f')}`, inline: true }
            )
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    },
};
