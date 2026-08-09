'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'helpalias',
    category: 'owners',
    ownerOnly: true,
    description: 'Active/désactive l\'affichage des alias dans le menu d\'aide',
    usage: '<on/off>',
    async run(client, message, args) {
        const status = args[0]?.toLowerCase();
        if (!status || !['on', 'off'].includes(status)) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${this.usage}\``)] });
        }
        const enabled = status === 'on';
        await Guild.updateMany({}, { 'config.helpAlias': enabled });
        message.channel.send({ embeds: [EmbedHelper.success(`Affichage des alias dans l'aide ${enabled ? 'activé' : 'désactivé'}.`)] });
    },
};
