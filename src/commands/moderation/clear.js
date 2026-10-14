'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { mapLimit } = require('../../utils/concurrency');

// Suppression d'un paquet (100 max) : en masse, sinon un par un si Discord refuse.
async function removeMessages(channel, list) {
    if (list.length === 1) return list[0].delete().then(() => 1).catch(() => 0);
    try {
        return (await channel.bulkDelete(list, true)).size;
    } catch {
        let count = 0;
        for (const m of list) {
            try { await m.delete(); count++; } catch { /* déjà supprimé */ }
        }
        return count;
    }
}

module.exports = {
    name: 'clear',
    category: 'moderation',
    description: 'Supprimer tous les messages du salon, ou tous ceux d\'une personne (mention ou ID).',
    usage: '-clear [@membre/ID] [nombre]',
    permissions: ['ManageMessages'],
    botPermissions: ['ManageMessages'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'webhooks') {
            const webhooks = await message.guild.fetchWebhooks();
            if (!webhooks.size) return message.channel.send({ embeds: [EmbedHelper.error('Aucun webhook trouvé.')] });
            await mapLimit([...webhooks.values()], (webhook) => webhook.delete(), 5);
            return message.channel.send({ embeds: [EmbedHelper.success(`${webhooks.size} webhooks supprimés.`)] });
        }

        if (sub === 'wl' || sub === 'whitelist') {
            const Guild = require('../../models/Guild');
            await Guild.updateOne({ guildId: message.guild.id }, { 'antiraid.whitelist': [] });
            // Sans invalidation, la whitelist "vidée" restait active dans le cache.
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Whitelist vidée.')] });
        }

        if (sub === 'bl' || sub === 'blacklist') {
            const Blacklist = require('../../models/Blacklist');
            const PermissionsHelper = require('../../utils/permissions');
            if (!PermissionsHelper.isBotOwner(client, message.author.id)) return message.channel.send({ embeds: [EmbedHelper.error('Permission insuffisante.')] });
            await Blacklist.deleteMany({});
            return message.channel.send({ embeds: [EmbedHelper.success('Blacklist globale vidée.')] });
        }

        const guildSettings = message.guildSettings || client.cache.getGuild(message.guild.id);
        // Limite fixée par le serveur (+clear limit), sinon aucune : tout ce qui peut l'être.
        const serverLimit = guildSettings?.moderation?.clearLimit || null;

        // « +clear » : tous les messages possibles du salon. « +clear @membre » (ou son ID) :
        // tous ses messages dans ce salon. Un nombre, placé n'importe où, limite la suppression.
        const targetId = args.map(arg => Helpers.resolveUserId(arg)).find(Boolean) || null;
        const number = args.map(arg => (/^\d{1,5}$/.test(arg) ? parseInt(arg, 10) : null)).find(n => n > 0) || null;
        const wanted = Math.min(number || Infinity, serverLimit || Infinity);

        await message.delete().catch(() => {});

        // Discord ne supprime en masse que les messages de moins de 14 jours : les plus anciens restent.
        const tooOld = Date.now() - 14 * 24 * 60 * 60 * 1000 + 60_000;
        const keep = m => m && m.id !== message.id && !m.pinned && m.createdTimestamp > tooOld
            && (!targetId || m.author?.id === targetId);

        // On parcourt le salon par pages de 100 et on supprime au fur et à mesure.
        let deleted = 0;
        let before;
        for (let page = 0; page < 100 && deleted < wanted; page++) {
            const batch = await message.channel.messages.fetch({ limit: 100, before }).catch(() => null);
            if (!batch?.size) break;
            const chunk = [...batch.values()].filter(keep).slice(0, wanted - deleted);
            if (chunk.length) deleted += await removeMessages(message.channel, chunk);
            before = batch.last().id;
            if (batch.size < 100 || batch.last().createdTimestamp <= tooOld) break;
        }

        if (!deleted) {
            return message.channel.send({ embeds: [EmbedHelper.error(targetId ? `Aucun message récent de <@${targetId}> dans ce salon.` : 'Aucun message à supprimer (Discord ne permet pas de supprimer en masse les messages de plus de 14 jours).')], allowedMentions: { parse: [] } });
        }

        const who = targetId ? ` de <@${targetId}>` : '';
        const msg = await message.channel.send({ embeds: [EmbedHelper.success(`🧹 **${deleted}** message(s)${who} supprimé(s).`)], allowedMentions: { parse: [] } });
        setTimeout(() => msg.delete().catch(() => {}), 3000);
    },
};
