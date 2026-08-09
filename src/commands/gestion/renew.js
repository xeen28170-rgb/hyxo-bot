'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'renew',
    category: 'gestion',
    description: 'Supprime et recrée un salon textuel',
    permissions: ['ManageChannels'],
    async run(client, message) {
        const channel = message.channel;
        const position = channel.position;
        
        await message.channel.send({ embeds: [EmbedHelper.info('🔄 Recréation...', 'Le salon va être recréé.')] });
        
        const newChannel = await channel.clone();
        await channel.delete();
        await newChannel.setPosition(position);
        
        const msg = await newChannel.send({ 
            content: `${message.author}`,
            embeds: [EmbedHelper.success('✨ Le salon a été réinitialisé.')] 
        });
        setTimeout(() => msg.delete().catch(() => {}), 5000);
    },
};

