'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'mp-settings',
    category: 'owners',
    ownerOnly: true,
    description: 'Configure les paramètres des messages privés envoyés par le bot',
    usage: '<cooldown|max> <valeur>',
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        const value = parseInt(args[1]);

        if (sub === 'cooldown' && value > 0) {
            client.dmCooldown = value;
            return message.channel.send({ embeds: [EmbedHelper.success(`Cooldown MP défini à **${value}s**.`)] });
        }

        if (sub === 'max' && value > 0) {
            client.dmMaxPerDay = value;
            return message.channel.send({ embeds: [EmbedHelper.success(`Maximum de MPs par jour défini à **${value}**.`)] });
        }

        message.channel.send({ embeds: [EmbedHelper.info('📧 Paramètres MP', [
            `Cooldown actuel: ${client.dmCooldown || 5}s`,
            `Max/jour: ${client.dmMaxPerDay || 50}`,
            '',
            '`+mp-settings cooldown <secondes>`',
            '`+mp-settings max <nombre>`',
        ].join('\n'))] });
    },
};
