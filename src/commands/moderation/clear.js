'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'clear',
    category: 'moderation',
    description: 'Supprimer des messages.',
    usage: '+clear [nombre]',
    permissions: ['ManageMessages'],
    botPermissions: ['ManageMessages'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'webhooks') {
            const webhooks = await message.guild.fetchWebhooks();
            if (!webhooks.size) return message.channel.send({ embeds: [EmbedHelper.error('Aucun webhook trouvé.')] });
            for (const [, webhook] of webhooks) await webhook.delete().catch(() => {});
            return message.channel.send({ embeds: [EmbedHelper.success(`${webhooks.size} webhooks supprimés.`)] });
        }

        if (sub === 'wl' || sub === 'whitelist') {
            const Guild = require('../../models/Guild');
            await Guild.updateOne({ guildId: message.guild.id }, { 'antiraid.whitelist': [] });
            return message.channel.send({ embeds: [EmbedHelper.success('Whitelist vidée.')] });
        }

        if (sub === 'bl' || sub === 'blacklist') {
            const Blacklist = require('../../models/Blacklist');
            if (!client.owners.has(message.author.id)) return message.channel.send({ embeds: [EmbedHelper.error('Permission insuffisante.')] });
            await Blacklist.deleteMany({});
            return message.channel.send({ embeds: [EmbedHelper.success('Blacklist globale vidée.')] });
        }

        const guildSettings = message.guildSettings || client.cache.getGuild(message.guild.id);
        const maxLimit = guildSettings?.moderation?.clearLimit || 100;

        let amount = parseInt(args[0]) || maxLimit;
        const target = await Helpers.resolveMember(message.guild, args[1]);

        if (amount > maxLimit) amount = maxLimit;

        let messages = await message.channel.messages.fetch({ limit: amount });
        if (target) {
            messages = messages.filter(m => m.author.id === target.id);
        }

        await message.delete().catch(() => {});
        const deleted = await message.channel.bulkDelete(messages, true);
        
        const msg = await message.channel.send({ embeds: [EmbedHelper.success(`🧹 **${deleted.size}** messages ont été supprimés.`)] });
        setTimeout(() => msg.delete().catch(() => {}), 3000);
    },
};
