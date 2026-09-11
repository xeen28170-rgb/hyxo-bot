'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'antispam',
    category: 'automod',
    description: 'Configure AntiSpam et AntiFlood',
    usage: '-antispam <on/off|nombre/durée|flood on/off|flood nombre/durée>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        if (!sub)
            return sendStatus(client, message);

        if (sub === 'flood' || sub === 'antiflood') {
            return handleFlood(client, message, args.slice(1));
        }

        if (sub === 'on' || sub === 'off') {
            const enabled = sub === 'on';
            const updates = {
                'automod.antispam.enabled': enabled,
            };
            if (enabled) updates['automod.enabled'] = true;
            await Guild.updateOne({ guildId: message.guild.id }, updates);
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`L'antispam est désormais **${enabled ? 'activé ✅' : 'désactivé ❌'}**.`)] });
        }

        if (sub.includes('/')) {
            const [nombreStr, dureeStr] = sub.split('/');
            const nombre = parseInt(nombreStr);
            if (!nombre || nombre < 2 || nombre > 20)
                return message.channel.send({ embeds: [EmbedHelper.error('Le nombre de messages doit être entre 2 et 20.')] });
            if (!dureeStr)
                return message.channel.send({ embeds: [EmbedHelper.error('Format invalide. Exemple: `-antispam 5/3s`')] });

            const ms = require('ms');
            const duration = ms(dureeStr);
            if (!duration || duration < 1000 || duration > 30000)
                return message.channel.send({ embeds: [EmbedHelper.error('La durée doit être entre 1s et 30s. Exemple: `-antispam 5/3s`')] });

            await Guild.updateOne({ guildId: message.guild.id }, {
                'automod.antispam.threshold': nombre,
                'automod.antispam.duration': duration,
            });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Sensibilité de l'antispam réglée à **${nombre}** messages par **${dureeStr}**.`)] });
        }

        return sendStatus(client, message);
    },
};

async function handleFlood(client, message, args) {
    const sub = args[0]?.toLowerCase();

    if (sub === 'on' || sub === 'off') {
        const enabled = sub === 'on';
        const updates = {
            'automod.antiflood.enabled': enabled,
        };
        if (enabled) updates['automod.enabled'] = true;
        await Guild.updateOne({ guildId: message.guild.id }, updates);
        client.cache.invalidateGuild(message.guild.id);
        return message.channel.send({ embeds: [EmbedHelper.success(`L'antiflood est désormais **${enabled ? 'activé ✅' : 'désactivé ❌'}**.`)] });
    }

    if (sub?.includes('/')) {
        const [nombreStr, dureeStr] = sub.split('/');
        const nombre = parseInt(nombreStr, 10);
        if (!nombre || nombre < 2 || nombre > 20) {
            return message.channel.send({ embeds: [EmbedHelper.error('Le nombre de messages similaires doit être entre 2 et 20.')] });
        }
        const ms = require('ms');
        const duration = ms(dureeStr);
        if (!duration || duration < 1000 || duration > 60000) {
            return message.channel.send({ embeds: [EmbedHelper.error('La durée doit être entre 1s et 60s. Exemple: `-antispam flood 4/10s`')] });
        }
        await Guild.updateOne({ guildId: message.guild.id }, {
            'automod.antiflood.threshold': nombre,
            'automod.antiflood.duration': duration,
        });
        client.cache.invalidateGuild(message.guild.id);
        return message.channel.send({ embeds: [EmbedHelper.success(`Sensibilité antiflood réglée à **${nombre}** messages similaires par **${dureeStr}**.`)] });
    }

    return sendStatus(client, message);
}

async function sendStatus(client, message) {
    const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
    const current = settings.automod?.antispam || {};
    const flood = settings.automod?.antiflood || {};
    const ms = require('ms');
    const embed = EmbedHelper.info('🚫 Configuration Antispam', [
        `**Statut:** ${current?.enabled ? '✅ Activé' : '❌ Désactivé'}`,
        `**Seuil:** ${current?.threshold || 5} messages`,
        `**Durée:** ${ms(current?.duration || 5000)}`,
        '',
        `**AntiFlood:** ${flood?.enabled ? '✅ Activé' : '❌ Désactivé'}`,
        `**Seuil Flood:** ${flood?.threshold || 4} messages similaires`,
        `**Durée Flood:** ${ms(flood?.duration || 10000)}`,
        '',
        '**Commandes:**',
        '`-antispam on/off` — activer/désactiver',
        '`-antispam 5/3s` — 5 messages en 3s = spam',
        '`-antispam flood on/off` — activer l\'antiflood',
        '`-antispam flood 4/10s` — 4 messages similaires en 10s',
    ].join('\n'), { color: 0xFF0000 });
    return message.channel.send({ embeds: [embed] });
}
