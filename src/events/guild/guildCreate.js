'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const ConfigCloud = require('../../services/configCloudService');
const Logger = require('../../utils/logger');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');
const { linkRow } = require('../../utils/botLinks');
const InviteSecurity = require('../../services/inviteSecurityService');
const Blacklist = require('../../models/Blacklist');
const BlacklistService = require('../../services/blacklistService');
const WetService = require('../../services/wetService');

function welcomeChannel(guild) {
    const me = guild.members.me;
    const canSend = channel => channel?.type === ChannelType.GuildText
        && channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
    if (canSend(guild.systemChannel)) return guild.systemChannel;
    return guild.channels.cache.filter(canSend).sort((a, b) => a.rawPosition - b.rawPosition).first() || null;
}

module.exports = {
    name: 'guildCreate',
    once: false,
    async run(client, guild) {
        if (await InviteSecurity.enforce(guild)) return;
        for (const entry of await Blacklist.find()) await BlacklistService.enforceGuild(guild, entry);
        await WetService.enforceGuild(guild);
        // Nouveau serveur : sa config est sauvegardée dans les 30 secondes.
        ConfigCloud.requestSync(client);
        const settings = await getGuildSettings(client, guild.id);
        Logger.info(`Le bot a rejoint un nouveau serveur : ${guild.name} (ID: ${guild.id})`);

        const channel = welcomeChannel(guild);
        if (!channel) return;
        const prefix = settings?.prefix || client.prefix;
        const embed = EmbedHelper.info('👋 Merci d\'avoir ajouté Hyxo !', [
            `Mon préfixe est \`${prefix}\`. Tapez \`${prefix}help\` pour voir toutes les commandes.`,
            '',
            '🛡️ Modération & antiraid · 🎫 Tickets · 💾 Backups · 🎉 Giveaways · 🎤 Vocaux temporaires',
        ].join('\n'));
        await channel.send({ embeds: [embed], components: [linkRow(client)] })
            .catch(error => Logger.warn(`Message de bienvenue impossible sur ${guild.id} : ${error.message}`));
    },
};
