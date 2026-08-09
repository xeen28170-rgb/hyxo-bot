'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'banner',
    category: 'utility',
    description: 'Permet de récupérer la bannière de quelqu\'un ou du serveur',
    usage: '[membre | server]',
    async run(client, message, args) {
        if (args[0]?.toLowerCase() === 'server') {
            const banner = message.guild.bannerURL({ size: 1024 });
            if (!banner) return message.channel.send({ embeds: [EmbedHelper.error('Ce serveur n\'a pas de bannière.')] });
            const embed = EmbedHelper.info(`📸 Bannière de ${message.guild.name}`, `[Lien de l'image](${banner})`, { color: 0xFF0000 });
            embed.setImage(banner);
            return message.channel.send({ embeds: [embed] });
        }

        const user = await Helpers.resolveUser(client, args[0], message.guild) || message.author;
        const fullUser = await client.users.fetch(user.id, { force: true });
        
        if (!fullUser.banner) return message.channel.send({ embeds: [EmbedHelper.error('Cet utilisateur n\'a pas de bannière.')] });

        const banner = fullUser.bannerURL({ dynamic: true, size: 1024 });
        const embed = EmbedHelper.info(`🖼️ Bannière de ${user.tag}`, `[Lien de l'image](${banner})`, { color: 0xFF0000 });
        embed.setImage(banner);

        message.channel.send({ embeds: [embed] });
    },
};
