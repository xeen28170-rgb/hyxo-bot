'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'set',
    category: 'owners',
    ownerOnly: true,
    description: 'Permet de changer le nom, la photo de profil ou la bannière du bot',
    usage: '<name/pic/banner> [valeur]',
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        const value = args.slice(1).join(' ');

        if (sub === 'name') {
            if (!value) return message.channel.send({ embeds: [EmbedHelper.error('Fournissez un nom.')] });
            await client.user.setUsername(value);
            return message.channel.send({ embeds: [EmbedHelper.success(`Nom du bot changé en **${value}**.`)] });
        }

        if (sub === 'pic' || sub === 'avatar') {
            const url = value || message.attachments.first()?.url;
            if (!url) return message.channel.send({ embeds: [EmbedHelper.error('Fournissez un lien ou une image.')] });
            await client.user.setAvatar(url);
            return message.channel.send({ embeds: [EmbedHelper.success('Photo de profil du bot changée.')] });
        }

        if (sub === 'banner') {
            const url = value || message.attachments.first()?.url;
            if (!url) return message.channel.send({ embeds: [EmbedHelper.error('Fournissez un lien ou une image.')] });
            await client.user.setBanner(url);
            return message.channel.send({ embeds: [EmbedHelper.success('Bannière du bot changée.')] });
        }

        if (sub === 'profil') {
            const prefix = message.guildSettings?.prefix || client.prefix;
            return message.channel.send({ embeds: [EmbedHelper.info('👤 Set Profil', `Permet de modifier d'un coup le profil du bot.\nUsage: \`${prefix}set profil <nom> ,, <avatar_url> ,, <banner_url>\``, { color: 0xFF0000 })] });
        }

        const prefix = message.guildSettings?.prefix || client.prefix;
        return message.channel.send({ embeds: [EmbedHelper.info('⚙️ Config Bot', `\`${prefix}set name <nom>\`\n\`${prefix}set pic <lien>\`\n\`${prefix}set banner <lien>\`\n\`${prefix}set profil <bulk>\``)] });
    },
};
