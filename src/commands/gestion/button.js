'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'button',
    category: 'gestion',
    description: 'Gère les boutons personnalisés sur les messages du bot',
    usage: '<add/del> <lien>',
    permissions: ['ManageMessages'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        const url = args[1];

        if (sub === 'list') {
            const settings = message.guildSettings || await Guild.findOne({ guildId: message.guild.id });
            const buttons = settings?.config?.buttons || [];
            if (!buttons.length) {
                return message.channel.send({ embeds: [EmbedHelper.info('📋 Boutons personnalisés', 'Aucun bouton configuré.')] });
            }
            const lines = buttons.map((b, i) => `${i + 1}. **${b.label}** → ${b.url}`);
            return message.channel.send({ embeds: [EmbedHelper.info('📋 Boutons personnalisés', lines.join('\n'))] });
        }

        if (!sub || !url || !['add', 'del'].includes(sub)) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${this.usage}\``)] });
        }

        if (sub === 'add' && !url.startsWith('https://')) {
            return message.channel.send({ embeds: [EmbedHelper.error('Le lien doit commencer par https://.')] });
        }

        if (sub === 'add' && !args[2]) {
            const prefix = message.guildSettings?.prefix || client.prefix;
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${prefix}button add <lien> <label>\``)] });
        }

        const settings = message.guildSettings || await Guild.findOne({ guildId: message.guild.id });
        let buttons = settings?.config?.buttons ? [...settings.config.buttons] : [];

        if (sub === 'add') {
            const label = args.slice(2).join(' ');
            buttons.push({ url, label });
            await Guild.updateOne({ guildId: message.guild.id }, { 'config.buttons': buttons });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Bouton **${label}** ajouté.`)] });
        }

        const index = parseInt(url) - 1;
        if (isNaN(index) || index < 0 || index >= buttons.length) {
            const prefix = message.guildSettings?.prefix || client.prefix;
            return message.channel.send({ embeds: [EmbedHelper.error(`Index invalide. Utilisez \`${prefix}button list\` pour voir les index.`)] });
        }

        const removed = buttons.splice(index, 1)[0];
        await Guild.updateOne({ guildId: message.guild.id }, { 'config.buttons': buttons });
        client.cache.invalidateGuild(message.guild.id);
        message.channel.send({ embeds: [EmbedHelper.success(`Bouton **${removed.label}** supprime.`)] });
    },
};
