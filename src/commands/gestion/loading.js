'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'loading',
    category: 'gestion',
    description: 'Affiche une barre de chargement avec le message souhaité et la durée souhaitée',
    usage: '<durée> <message>',
    async run(client, message, args) {
        const durationStr = args[0];
        const text = args.slice(1).join(' ');
        
        const prefix = message.guildSettings?.prefix || client.prefix;
        if (!durationStr || !text) return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${prefix}loading <durée> <message>\``)] });

        const ms = require('ms')(durationStr);
        if (!ms) return message.channel.send({ embeds: [EmbedHelper.error('Durée invalide.')] });

        const msg = await message.channel.send(`⏳ **0%** [..........] ${text}`);
        
        const steps = 10;
        const interval = ms / steps;
        let current = 0;

        const timer = setInterval(async () => {
            try {
                current++;
                const progress = (current / steps) * 100;
                const bar = '█'.repeat(current) + '.'.repeat(steps - current);
                
                await msg.edit(`${current === steps ? '✅' : '⏳'} **${progress}%** [${bar}] ${text}`).catch(() => {});
                
                if (current === steps) clearInterval(timer);
            } catch {
                clearInterval(timer);
            }
        }, interval);
    },
};
