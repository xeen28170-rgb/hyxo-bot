'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'antimassmention',
    category: 'automod',
    description: 'Active/désactive la protection contre le spam mention et définit le seuil',
    usage: '<on/off> | <nombre>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        if (!sub)
            return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+antimassmention <on/off>` ou `+antimassmention <nombre>`')] });

        if (sub === 'on' || sub === 'off') {
            const enabled = sub === 'on';
            await Guild.updateOne({ guildId: message.guild.id }, { 'automod.antimassmention.enabled': enabled });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`L'antimassmention est désormais **${enabled ? 'activé ✅' : 'désactivé ❌'}**.`)] });
        }

        const nombre = parseInt(sub, 10);
        if (!isNaN(nombre) && nombre >= 2 && nombre <= 50) {
            await Guild.updateOne({ guildId: message.guild.id }, { 'automod.antimassmention.threshold': nombre });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`L'antimassmention se déclenchera à partir de **${nombre}** mentions dans un même message.`)] });
        }

        if (!isNaN(parseInt(sub, 10))) {
            return message.channel.send({ embeds: [EmbedHelper.error('Le seuil doit être entre 2 et 50.')] });
        }

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const current = settings.automod?.antimassmention;
        const embed = EmbedHelper.info('📢 Configuration Anti-Mass-Mention', [
            `**Statut:** ${current?.enabled ? '✅ Activé' : '❌ Désactivé'}`,
            `**Seuil:** ${current?.threshold || 5} mentions`,
            '',
            '**Commandes:**',
            '`+antimassmention on/off` — activer/désactiver',
            '`+antimassmention <nombre>` — seuil de mentions (2-50)',
        ].join('\n'), { color: 0xFF0000 });
        message.channel.send({ embeds: [embed] });
    },
};
