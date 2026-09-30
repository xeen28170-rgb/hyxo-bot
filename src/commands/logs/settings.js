'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'modsettings',
    category: 'logs',
    description: 'Affiche les paramètres du bot sur le serveur',
    permissions: ['Administrator'],
    async run(client, message) {
        const settings = message.guildSettings || await Guild.findOne({ guildId: message.guild.id });
        const l = settings?.logs || {};
        const am = settings?.automod || {};

        const embed = EmbedHelper.info('⚙️ Paramètres du Serveur', [
            '**Logs:**',
            `• Modération: ${l.modLogs ? `<#${l.modLogs}>` : '❌'}`,
            `• Messages: ${l.messageLogs ? `<#${l.messageLogs}>` : '❌'}`,
            `• Vocal: ${l.voiceLogs ? `<#${l.voiceLogs}>` : '❌'}`,
            `• Boosts: ${l.boostLogs ? `<#${l.boostLogs}>` : '❌'}`,
            `• Rôles: ${l.roleLogs ? `<#${l.roleLogs}>` : '❌'}`,
            `• Antiraid: ${l.raidLogs ? `<#${l.raidLogs}>` : '❌'}`,
            '',
            '**Automod:**',
            `• Global: ${am.enabled ? '✅' : '❌'}`,
            `• AntiSpam: ${am.antispam?.enabled ? '✅' : '❌'}`,
            `• AntiLink: ${am.antilink?.enabled ? '✅' : '❌'}`,
        ].join('\n'), { color: 0xFF0000 });

        await message.channel.send({ embeds: [embed] });
    },
};
