'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const AntiraidService = require('../../services/antiraidService');
const LogDispatcher = require('../../utils/logDispatcher');
const Logger = require('../../utils/logger');
const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const { getGuildSettings } = require('../../utils/guildSettings');
const PrisonService = require('../../services/prisonService');
const BlacklistService = require('../../services/blacklistService');
const WetService = require('../../services/wetService');

async function sendWelcome(guild, member, settings) {
    if (!settings?.welcome?.enabled || !settings?.welcome?.channel) return;
    const welcomeChannel = guild.channels.cache.get(settings.welcome.channel);
    if (!welcomeChannel) return;
    // Message texte simple, sans embed. Sans {user} dans le texte, on mentionne
    // quand même le membre au début pour qu'il soit notifié.
    const template = settings.welcome.message || 'Bienvenue {user} sur **{server}** !';
    let text = template
        .replace(/{user}/g, () => `<@${member.id}>`)
        .replace(/{server}/g, () => guild.name)
        .replace(/{memberCount}/g, () => String(guild.memberCount));
    if (!template.includes('{user}')) text = `<@${member.id}> ${text}`;
    await welcomeChannel.send({
        content: text.slice(0, 2000),
        allowedMentions: { users: [member.id] },
        raw: true,
    }).catch(() => {});
}

// Tous les rôles d'arrivée (autorole + rôles de bienvenue) en UN seul appel Discord.
async function addJoinRoles(guild, member, settings) {
    const ids = [...new Set([settings?.welcome?.autorole, ...(settings?.welcome?.roles || [])].filter(Boolean))];
    if (!ids.length) return;
    const resolved = await Promise.all(ids.map(roleId => guild.roles.cache.get(roleId) || guild.roles.fetch(roleId).catch(() => null)));
    const roles = resolved.filter(Boolean);
    if (roles.length) await member.roles.add(roles).catch(() => {});
}

module.exports = {
    name: 'guildMemberAdd',
    async run(client, member) {
        try {
            const guild = member.guild;
            if (await BlacklistService.onJoin(member)) return;
            if (await WetService.onJoin(member)) return;

            const settings = await getGuildSettings(client, guild.id);

            // Antiraid d'abord : un compte expulsé ne reçoit pas de message de bienvenue.
            if (settings?.antiraid?.enabled && await AntiraidService.handleMemberJoin(client, member, settings)) return;

            scheduleStatsUpdate(client, guild, 'member_add', 15_000);

            const joinEmbed = EmbedHelper.info('📥 Arrivée d\'un membre', [
                `**Utilisateur:** ${member.user} (\`${member.id}\`)`,
                `**Pseudo:** ${member.user.username}`,
                `**Création du compte:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
                `**Nombre total de membres:** \`${guild.memberCount}\``,
                '',
                `> *Bienvenue sur ${guild.name} !*`
            ].join('\n'), { color: 0x57F287 })
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `ID: ${member.id}`, iconURL: guild.iconURL() })
                .setTimestamp();
            // Non bloquant : le log ne doit pas retarder le message de bienvenue.
            void Promise.resolve(LogDispatcher.join(guild, joinEmbed)).catch(err => {
                Logger.error('[guildMemberAdd] Log arrivée:', { message: err.message });
            });

            // Message de bienvenue, rôles d'arrivée et prison EN MÊME TEMPS : avant, le message
            // attendait l'ajout des rôles (appel Discord parfois lent) et arrivait bien après.
            await Promise.all([
                sendWelcome(guild, member, settings),
                addJoinRoles(guild, member, settings),
                PrisonService.restorePrisonRole(client, member).catch(error => {
                    Logger.error('[guildMemberAdd] Prison:', error.message);
                }),
            ]);
        } catch (err) {
            Logger.error('[guildMemberAdd] Erreur:', { message: err.message, stack: err.stack });
        }
    },
};
