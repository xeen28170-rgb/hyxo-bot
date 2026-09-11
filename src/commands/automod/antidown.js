'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'antidown',
    aliases: ['antivanity', 'antidownurl', 'protectedown'],
    category: 'automod',
    description: 'Protège l\'URL vanity du serveur contre les changements. Toute tentative (hors owner bot) = ban automatique.',
    usage: '-antidown <on|off|restore|wl add/remove <id>>',
    permissions: ['Administrator'],
    botPermissions: ['BanMembers', 'ManageGuild', 'ViewAuditLog'],
    async run(client, message, args) {
        const sub = (args[0] || '').toLowerCase();
        const guildId = message.guild.id;

        if (!sub || sub === 'view') {
            const settings = await getGuildSettings(client, guildId, { create: false });
            const ad = settings?.antidown || {};
            const enabled = ad.enabled === true || ad.enabled === 'on' || ad.enabled === 'max';
            const desc = [
                `**État:** ${enabled ? '🟢 Activé' : '⚫ Désactivé'}`,
                `**Restauration URL:** ${ad.restore === false ? '❌ Non' : '✅ Oui'}`,
                `**Punition:** \`${ad.punishment || 'ban'}\``,
                `**URL de référence:** ${ad.vanity ? `\`discord.gg/${ad.vanity}\`` : 'Non définie'}`,
            ].join('\n');
            return message.channel.send({ embeds: [EmbedHelper.info('🛡️ Anti-Down URL serveur', desc)] });
        }

        if (sub === 'on' || sub === 'off') {
            const enabled = sub === 'on';
            const updates = { 'antidown.enabled': enabled };
            if (enabled && message.guild.vanityURLCode) {
                updates['antidown.vanity'] = message.guild.vanityURLCode;
            }
            await Guild.updateOne({ guildId }, updates);
            invalidateGuildSettings(client, guildId);
            return message.channel.send({ embeds: [EmbedHelper.success(enabled
                ? '🛡️ Anti-Down **activé** — toute tentative de changement d\'URL (hors owner bot) sera **bannie automatiquement**, whitelist comprise.'
                : 'Anti-Down **désactivé**.')] });
        }

        if (sub === 'restore') {
            const value = (args[1] || '').toLowerCase();
            if (!['on', 'off'].includes(value)) {
                return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-antidown restore <on|off>`')] });
            }
            await Guild.updateOne({ guildId }, { 'antidown.restore': value === 'on' });
            invalidateGuildSettings(client, guildId);
            return message.channel.send({ embeds: [EmbedHelper.success(`Restauration de l'URL après attaque : **${value === 'on' ? 'activée' : 'désactivée'}**.`)] });
        }

        return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-antidown <on|off|restore on/off>`')] });
    },
};
