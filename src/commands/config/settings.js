'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'settings',
    category: 'config',
    description: 'Affiche les paramètres du bot sur le serveur',
    async run(client, message) {
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id, { create: false });
        if (!settings) return message.channel.send({ embeds: [EmbedHelper.error('Configuration introuvable.')] });

        const l = settings.logs || {};
        const am = settings.automod || {};
        const ar = settings.antiraid || {};

        const embed = EmbedHelper.info(`⚙️ Paramètres: ${message.guild.name}`, [
            '**📋 Logs**',
            `Mod: ${l.modLogs ? '✅' : '❌'} | Msg: ${l.messageLogs ? '✅' : '❌'} | Voc: ${l.voiceLogs ? '✅' : '❌'}`,
            `Boost: ${l.boostLogs ? '✅' : '❌'} | Role: ${l.roleLogs ? '✅' : '❌'} | Raid: ${l.raidLogs ? '✅' : '❌'}`,
            '',
            '**🛡️ Automod**',
            `Spam: ${am.antispam?.enabled ? '✅' : '❌'} | Links: ${am.antilink?.enabled ? '✅' : '❌'}`,
            `Mentions: ${am.antimassmention?.enabled ? '✅' : '❌'} | BadWords: ${am.badwords?.enabled ? '✅' : '❌'}`,
            '',
            '**🔒 Sécurité (Antiraid)**',
            `Channels: ${ar.antichannel ? '✅' : '❌'} | Roles: ${ar.antirole ? '✅' : '❌'}`,
            `Bots: ${ar.antibot ? '✅' : '❌'} | Token: ${ar.antitoken ? '✅' : '❌'}`,
        ].join('\n'), { color: 0xFF0000 });

        message.channel.send({ embeds: [embed] });
    },
};
