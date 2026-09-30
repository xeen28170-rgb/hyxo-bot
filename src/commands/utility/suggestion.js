'use strict';

const { getEmoji } = require('../../config/emojis');

const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'suggestion',
    category: 'utility',
    description: 'Poste une suggestion sur le serveur',
    usage: '<message>',
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'lb' || sub === 'leaderboard') {
            return message.channel.send({ embeds: [EmbedHelper.info('🏆 Leaderboard Suggestions', 'Voici les suggestions les mieux notées :\n\n*Bientôt disponible*', { color: 0xFF0000 })] });
        }

        if (sub === 'settings' || sub === 'config') {
            const prefix = message.guildSettings?.prefix || client.prefix;
            return message.channel.send({ embeds: [EmbedHelper.info('⚙️ Configuration Suggestions', `Utilisez \`${prefix}suggestion settings\` pour configurer le salon et les options.`, { color: 0xFF0000 })] });
        }

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id, { create: false });
        const channelId = settings?.config?.suggestionChannel;
        
        const prefix = message.guildSettings?.prefix || client.prefix;
        if (!channelId) return message.channel.send({ embeds: [EmbedHelper.error(`Le salon de suggestions n'est pas configuré. Utilisez \`${prefix}suggestion settings\`.`)] });
        
        const channel = message.guild.channels.cache.get(channelId);
        if (!channel) return message.channel.send({ embeds: [EmbedHelper.error('Salon de suggestions introuvable.')] });

        const content = args.join(' ');
        if (!content) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir votre suggestion.')] });

        const embed = EmbedHelper.info('💡 Nouvelle suggestion', content, { color: 0xFF0000 });
        embed.setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) });
        embed.setFooter({ text: `ID: ${message.author.id}` });

        const msg = await channel.send({ embeds: [embed] });
        await msg.react(getEmoji('SUCCESS'));
        await msg.react(getEmoji('ERROR'));

        message.channel.send({ embeds: [EmbedHelper.success('Votre suggestion a été envoyée !')] });
    },
};
