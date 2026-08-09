'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'choose',
    category: 'giveaway',
    description: 'Lance un tirage au sort instantané sur un message (reactions)',
    usage: '<messageId>',
    async run(client, message, args) {
        const msgId = args[0];
        if (!msgId) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir l\'ID du message.')] });

        const msg = await message.channel.messages.fetch(msgId).catch(() => null);
        if (!msg) return message.channel.send({ embeds: [EmbedHelper.error('Message introuvable dans ce salon.')] });

        const reactions = msg.reactions.cache;
        if (!reactions.size) return message.channel.send({ embeds: [EmbedHelper.error('Aucune réaction sur ce message.')] });

        const users = new Set();
        for (const reaction of reactions.values()) {
            const reactors = await reaction.users.fetch();
            reactors.forEach(u => { if (!u.bot) users.add(u.id); });
        }

        if (!users.size) return message.channel.send({ embeds: [EmbedHelper.error('Aucun participant trouvé.')] });

        const winner = Array.from(users)[Math.floor(Math.random() * users.size)];
        await message.channel.send({ content: `🎉 Le gagnant du tirage au sort est : <@${winner}> !` });
    },
};
