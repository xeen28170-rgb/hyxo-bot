'use strict';


module.exports = {
    name: 'say',
    category: 'owners',
    ownerOnly: true,
    description: 'Fait dire au bot le message voulu',
    usage: '<message>',
    async run(client, message, args) {
        const text = args.join(' ');
        if (!text) return;
        
        if (message.deletable) message.delete().catch(() => {});
        await message.channel.send({ content: text, allowedMentions: { parse: [] } });
    },
};
