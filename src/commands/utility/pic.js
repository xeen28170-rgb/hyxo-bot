'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'pic',
    category: 'utility',
    description: 'Permet de récupérer la photo de profil de quelqu\'un ou l\'icône/bannière du serveur',
    usage: '[membre | server pic | server banner]',
    async run(client, message, args) {
        if (args[0]?.toLowerCase() === 'server') {
            const sub = args[1]?.toLowerCase();
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
                const embed = EmbedHelper.info(`📸 Bannière de ${message.guild.name}`, `[Lien de l'image](${banner})`, { color: 0xFF0000 });
                embed.setImage(banner);
                return message.channel.send({ embeds: [embed] });
            }
        }

        const user = await Helpers.resolveUser(client, args[0], message.guild) || message.author;
        const avatar = user.displayAvatarURL({ dynamic: true, size: 1024 });

        const embed = EmbedHelper.info(`📸 Photo de profil de ${user.tag}`, `[Lien de l'image](${avatar})`, { color: 0xFF0000 });
        embed.setImage(avatar);

        message.channel.send({ embeds: [embed] });
    },
};
