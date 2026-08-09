'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'helptype',
    category: 'owners',
    ownerOnly: true,
    description: 'Change le mode de navigation du menu d\'aide (embed/menu)',
    usage: '<embed|menu>',
    async run(client, message, args) {
        const mode = args[0]?.toLowerCase();
        if (!mode || !['embed', 'menu'].includes(mode)) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${this.usage}\``)] });
        }
        client.helpMode = mode;
        message.channel.send({ embeds: [EmbedHelper.success(`Mode d'aide changé pour **${mode}**.`)] });
    },
};
