'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');
const Helpers = require('../../utils/helpers');
const { getAccessLevel, LEVEL } = require('../../utils/privateVoice');

module.exports = {
    name: 'wl',
    aliases: ['whitelist', 'unwl'],
    category: 'automod',
    description: 'Gérer la whitelist antiraid du serveur (membres qui bypassent les protections).',
    usage: '-wl list | add <ID/@mention/rôle> | remove <ID/@mention/rôle> | clear',
    async run(client, message, args) {
        const permissions = await getGuildSettings(client, message.guild.id, { create: false });
        if (await getAccessLevel(client, message.member, permissions) < LEVEL.OWNER) {
            return message.channel.send({ embeds: [EmbedHelper.error('Seuls les Owners et le proprietaire du bot peuvent gerer la WL.')] });
        }
        const invokedName = (message.content || '').trim().split(/\s+/)[0];
        if (invokedName.endsWith('unwl')) args = ['remove', ...args];
        else if (Helpers.resolveUserId(args[0]) || /^<@&\d{17,20}>$/.test(args[0] || '')) args = ['add', ...args];
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
            const targetArg = (args[1] || '').trim();
            const role = Helpers.resolveRole(message.guild, targetArg);
            const member = role ? null : await Helpers.resolveMember(message.guild, targetArg);
            const rawId = Helpers.resolveUserId(targetArg);
            const targetId = role?.id || member?.id || rawId;
            if (!targetId) {
                return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`-wl ${sub} <ID/@mention/rôle>\``)] });
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
