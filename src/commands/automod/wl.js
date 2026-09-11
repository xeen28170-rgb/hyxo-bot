'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'wl',
    aliases: ['whitelist', 'unwl'],
    category: 'automod',
    description: 'Gérer la whitelist antiraid du serveur (membres qui bypassent les protections).',
    usage: '-wl list | add <id> | remove <id> | clear',
    permissions: ['Administrator'],
    async run(client, message, args) {
        const sub = (args[0] || '').toLowerCase();
        const guildId = message.guild.id;

        if (sub === 'list' || !sub) {
            const settings = await getGuildSettings(client, guildId, { create: false });
            const list = settings?.antiraid?.whitelist || [];
            const desc = list.length
                ? list.map(id => formatEntry(message.guild, id)).join('\n')
                : 'Aucun membre dans la whitelist.';
            return message.channel.send({ embeds: [EmbedHelper.info('⚪ Whitelist antiraid', desc.slice(0, 4000))] });
        }

        if (sub === 'add' || sub === 'remove') {
            const targetId = (args[1] || '').trim();
            if (!targetId || !/^\d+$/.test(targetId)) {
                return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`-wl ${sub} <ID>\``)] });
            }

            const settings = await getGuildSettings(client, guildId, { create: false });
            const current = Array.isArray(settings?.antiraid?.whitelist) ? settings.antiraid.whitelist : [];

            if (sub === 'remove') {
                if (!current.includes(targetId)) {
                    return message.channel.send({ embeds: [EmbedHelper.error('Cet utilisateur n\'est pas dans la whitelist.')] });
                }
                await Guild.updateOne({ guildId }, { 'antiraid.whitelist': current.filter(id => id !== targetId) });
                invalidateGuildSettings(client, guildId);
                return message.channel.send({ embeds: [EmbedHelper.success(`${formatEntry(message.guild, targetId)} a été retiré de la whitelist antiraid.`)] });
            }

            if (current.includes(targetId)) {
                return message.channel.send({ embeds: [EmbedHelper.error('Cet utilisateur est déjà dans la whitelist.')] });
            }
            await Guild.updateOne({ guildId }, { 'antiraid.whitelist': [...current, targetId] });
            invalidateGuildSettings(client, guildId);
            return message.channel.send({ embeds: [EmbedHelper.success(`${formatEntry(message.guild, targetId)} a été ajouté à la whitelist antiraid.`)] });
        }

        if (sub === 'clear') {
            await Guild.updateOne({ guildId }, { 'antiraid.whitelist': [] });
            invalidateGuildSettings(client, guildId);
            return message.channel.send({ embeds: [EmbedHelper.success('Whitelist antiraid vidée.')] });
        }

        return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-wl list | add <id> | remove <id> | clear`')] });
    },
};

// Affiche une mention de rôle (si l'ID correspond à un rôle du serveur) ou de membre.
function formatEntry(guild, id) {
    const role = guild.roles.cache.get(id);
    if (role) return `<@&${id}> (\`${id}\`)`;
    return `<@${id}> (\`${id}\`)`;
}
