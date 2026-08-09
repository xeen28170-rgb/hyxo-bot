'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'punish',
    category: 'automod',
    description: 'Gère les seuils de strikes pour les sanctions automatiques de l\'automod',
    usage: '[set <warn/mute/kick/ban> <nombre> | reset | info]',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const strikes = settings.automod?.strikes || { warn: 3, mute: 5, kick: 7, ban: 10 };

        if (!sub || sub === 'info') {
            return message.channel.send({ embeds: [EmbedHelper.info('🔨 Seuils de Sanctions Automatiques', [
                'Nombre de strikes requis pour chaque sanction :',
                '',
                `⚠️ **Warn:** ${strikes.warn} strikes`,
                `🔇 **Mute:** ${strikes.mute} strikes`,
                `👢 **Kick:** ${strikes.kick} strikes`,
                `🔨 **Ban:** ${strikes.ban} strikes`,
                '',
                '**Usage:**',
                '`+punish set warn <nombre>` — seuil du warn',
                '`+punish set mute <nombre>` — seuil du mute',
                '`+punish set kick <nombre>` — seuil du kick',
                '`+punish set ban <nombre>` — seuil du ban',
                '`+punish reset` — rétablir les valeurs par défaut',
            ].join('\n'), { color: 0xFF0000 })] });
        }

        if (sub === 'set') {
            const type = args[1]?.toLowerCase();
            const nombre = parseInt(args[2], 10);
            const validTypes = ['warn', 'mute', 'kick', 'ban'];

            if (!validTypes.includes(type))
                return message.channel.send({ embeds: [EmbedHelper.error(`Type invalide. Valeurs possibles: \`${validTypes.join('`, `')}\``)] });
            if (isNaN(nombre) || nombre < 1 || nombre > 100)
                return message.channel.send({ embeds: [EmbedHelper.error('Le nombre de strikes doit être entre 1 et 100.')] });

            await Guild.updateOne({ guildId: message.guild.id }, { [`automod.strikes.${type}`]: nombre });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Le seuil de **${type}** a été défini à **${nombre}** strikes.`)] });
        }

        if (sub === 'reset') {
            await Guild.updateOne({ guildId: message.guild.id }, {
                'automod.strikes.warn': 3,
                'automod.strikes.mute': 5,
                'automod.strikes.kick': 7,
                'automod.strikes.ban': 10,
            });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Les seuils de sanctions ont été réinitialisés aux valeurs par défaut (warn:3, mute:5, kick:7, ban:10).')] });
        }

        message.channel.send({ embeds: [EmbedHelper.error('Usage: `+punish [set <type> <nombre> | reset | info]`')] });
    },
};
