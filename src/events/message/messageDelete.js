'use strict';

const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const AutomodService = require('../../services/automodService');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'messageDelete',
    async run(client, message) {
        if (message.partial) {
            try {
                message = await message.fetch();
            } catch {
                return; // Impossible de récupérer le message
            }
        }
        if (!message.author || message.author.bot || !message.guild) return;

        client.cache.set(`snipe_${message.channel.id}`, {
            content: message.content,
            author: message.author,
            timestamp: Date.now(),
            image: message.attachments.first()?.proxyURL
        });

        const embed = EmbedHelper.info('🗑️ Message supprimé', [
            `**Auteur:** ${message.author} (\`${message.author.id}\`)`,
            `**Salon:** <#${message.channel.id}>`,
            `**Message ID:** \`${message.id}\``,
            '',
            '**Contenu:**',
            `\`\`\`\n${message.content || 'Aucun contenu (image ou sticker)'}\n\`\`\``
        ].join('\n'), { color: 0xFF0000 })
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `ID Auteur: ${message.author.id}`, iconURL: message.guild.iconURL() })
            .setTimestamp();

        await LogDispatcher.messages(message.guild, embed);

        const settings = await getGuildSettings(client, message.guild.id);
        await AutomodService.handleGhostPing(client, message, settings);
    },
};
