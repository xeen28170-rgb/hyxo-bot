'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'strikes',
    category: 'automod',
    description: 'Gérer le système de strikes de l\'automod',
    permissions: ['Administrator'],
    usage: '[info | set <warn/mute/kick/ban> <nombre> | reset | ancien <durée>]',
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const strikes = settings.automod?.strikes || { warn: 3, mute: 5, kick: 7, ban: 10 };

        if (!sub || sub === 'info') {
            return message.channel.send({ embeds: [EmbedHelper.info('⚖️ Système de Strikes', [
                '**Seuils actuels :**',
                `⚠️ Warn: **${strikes.warn}** strikes`,
                `🔇 Mute: **${strikes.mute}** strikes`,
                `👢 Kick: **${strikes.kick}** strikes`,
                `🔨 Ban: **${strikes.ban}** strikes`,
                '',
                '**TTL strikes:** 24h (réinitialisés automatiquement)',
                '',
                '**Usage:**',
                '`-strikes set warn <n>` / `mute` / `kick` / `ban`',
                '`-strikes reset` — valeurs par défaut',
            ].join('\n'), { color: 0xFF0000 })] });
        }

        if (sub === 'set') {
            const type = args[1]?.toLowerCase();
            const nombre = parseInt(args[2], 10);
            const validTypes = ['warn', 'mute', 'kick', 'ban'];
            if (!validTypes.includes(type))
                return message.channel.send({ embeds: [EmbedHelper.error(`Type invalide. Valeurs: \`${validTypes.join('`, `')}\``)] });
            if (isNaN(nombre) || nombre < 1 || nombre > 100)
                return message.channel.send({ embeds: [EmbedHelper.error('Le nombre doit être entre 1 et 100.')] });

            await Guild.updateOne({ guildId: message.guild.id }, { [`automod.strikes.${type}`]: nombre });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Seuil **${type}** réglé à **${nombre}** strikes.`)] });
        }

        if (sub === 'reset') {
            await Guild.updateOne({ guildId: message.guild.id }, {
                'automod.strikes.warn': 3,
                'automod.strikes.mute': 5,
                'automod.strikes.kick': 7,
                'automod.strikes.ban': 10,
            });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Seuils réinitialisés aux valeurs par défaut.')] });
        }

        if (sub === 'ancien') {
            const dureeStr = args[1];
            if (!dureeStr) return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-strikes ancien <durée>` (ex: 7j, 30j)')] });
            const dureeMs = Helpers.parseDuration(dureeStr);
            if (!dureeMs) return message.channel.send({ embeds: [EmbedHelper.error('Durée invalide. Exemple: `7j`, `30j`')] });

            await Guild.updateOne({ guildId: message.guild.id }, { 'automod.ancienDuration': dureeMs });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Un membre sera considéré comme **ancien** après **${dureeStr}** sur le serveur.`)] });
        }

        return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-strikes [info|set <type> <n>|reset|ancien <durée>]`')] });
    },
};
