'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'antilink',
    category: 'automod',
    description: 'Configure AntiLink et AntiInvite Discord',
    usage: '-antilink <on/off|invite on/off|all|wl>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        if (!sub)
            return sendStatus(client, message);

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);

        if (sub === 'on' || sub === 'off') {
            const enabled = sub === 'on';
            await Guild.updateOne({ guildId: message.guild.id }, { 'automod.antilink.enabled': enabled });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`L'antilink est désormais **${enabled ? 'activé ✅' : 'désactivé ❌'}**.`)] });
        }

        if (sub === 'invite' || sub === 'antiinvite') {
            const status = args[1]?.toLowerCase();
            if (sub === 'invite' && !status) {
                await Guild.updateOne({ guildId: message.guild.id }, { 'automod.antilink.mode': 'invite' });
                client.cache.invalidateGuild(message.guild.id);
                return message.channel.send({ embeds: [EmbedHelper.success('L\'antilink s\'activera pour **les invitations Discord uniquement**.')] });
            }
            if (!['on', 'off'].includes(status)) {
                return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-antilink invite <on/off>`')] });
            }
            const enabled = status === 'on';
            await Guild.updateOne({ guildId: message.guild.id }, {
                'automod.antiinvite.enabled': enabled,
                'automod.enabled': enabled ? true : settings.automod?.enabled,
            });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`AntiInvite Discord est désormais **${enabled ? 'activé ✅' : 'désactivé ❌'}**.`)] });
        }

        if (sub === 'all') {
            await Guild.updateOne({ guildId: message.guild.id }, { 'automod.antilink.mode': sub });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`L'antilink s'activera pour **${sub === 'invite' ? 'les invitations Discord uniquement' : 'tous les liens'}**.`)] });
        }

        if (sub === 'wl' || sub === 'whitelist') {
            const url = args[1];
            if (!url) return message.channel.send({ embeds: [EmbedHelper.error('❌ Précise une URL à whitelister. Ex: `-antilink wl youtube.com`')] });
            await Guild.updateOne({ guildId: message.guild.id }, { $addToSet: { 'automod.antilink.whitelist': url } });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`**${url}** ajouté à la whitelist de l'antilink.`)] });
        }

        return sendStatus(client, message, settings);
    },
};

async function sendStatus(client, message, providedSettings = null) {
    const settings = providedSettings || message.guildSettings || await getGuildSettings(client, message.guild.id);
    const current = settings.automod?.antilink || {};
    const invite = settings.automod?.antiinvite || {};
    const embed = EmbedHelper.info('🔗 Configuration Antilink', [
        `**Statut:** ${current?.enabled ? '✅ Activé' : '❌ Désactivé'}`,
        `**Mode:** ${current?.mode || 'all'}`,
        `**AntiInvite Discord:** ${invite?.enabled ? '✅ Activé' : '❌ Désactivé'}`,
        `**Whitelist:** ${current?.whitelist?.length ? current.whitelist.join(', ') : 'Aucune'}`,
        `**Whitelist invites:** ${invite?.whitelist?.length ? invite.whitelist.join(', ') : 'Aucune'}`,
        '',
        '**Commandes:**',
        '`-antilink on/off` — activer/désactiver',
        '`-antilink invite` — bloque les invitations uniquement',
        '`-antilink invite on/off` — anti-invitations Discord séparé',
        '`-antilink all` — bloque tous les liens',
        '`-antilink wl <url>` — ajouter à la whitelist',
    ].join('\n'), { color: 0xFF0000 });
    return message.channel.send({ embeds: [embed] });
}
