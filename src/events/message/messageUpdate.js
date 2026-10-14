'use strict';

const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const AutomodService = require('../../services/automodService');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'messageUpdate',
    async run(client, oldMessage, newMessage) {
        if (oldMessage.partial) oldMessage = await oldMessage.fetch().catch(() => oldMessage);
        if (newMessage.partial) newMessage = await newMessage.fetch().catch(() => newMessage);

        const guild = newMessage.guild || oldMessage.guild;
        const author = newMessage.author || oldMessage.author;
        const oldContent = oldMessage.content || '';
        const newContent = newMessage.content || '';

        if (!guild || !author || author.bot || oldContent === newContent) return;

        const settings = await getGuildSettings(client, guild.id);

        if (AutomodService.isActive(settings)) {
            const blocked = await AutomodService.check(client, newMessage, settings);
            if (blocked) return;
        }

        const embed = EmbedHelper.info('📝 Message Modifié', [
            `**Auteur:** ${author.tag} (\`${author.id}\`)`,
            `**Salon:** <#${newMessage.channel?.id || oldMessage.channel?.id}>`,
            newMessage.url ? `**[Aller au message](${newMessage.url})**` : '',
            '',
            '**Ancien contenu:**',
            `\`\`\`\n${oldContent}\n\`\`\``,
            '**Nouveau contenu:**',
            `\`\`\`\n${newContent}\n\`\`\``
        ].filter(Boolean).join('\n'), { color: 0xFF0000 });

        await LogDispatcher.messages(guild, embed);
    },
};
