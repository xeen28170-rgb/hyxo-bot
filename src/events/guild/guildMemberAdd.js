'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const AntiraidService = require('../../services/antiraidService');
const LogDispatcher = require('../../utils/logDispatcher');
const Logger = require('../../utils/logger');
const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const { getGuildSettings } = require('../../utils/guildSettings');
const PrisonService = require('../../services/prisonService');
const BlacklistService = require('../../services/blacklistService');

module.exports = {
    name: 'guildMemberAdd',
    async run(client, member) {
        try {
            const guild = member.guild;
            if (await BlacklistService.onJoin(member)) return;

            const settings = await getGuildSettings(client, guild.id);
            await PrisonService.restorePrisonRole(client, member);

            if (settings?.antiraid?.enabled) {
                await AntiraidService.handleMemberJoin(client, member, settings);
            }

            scheduleStatsUpdate(client, guild, 'member_add', 15_000);

            // Tous les rôles d'arrivée (autorole + rôles de bienvenue) en UN seul appel Discord,
            // au lieu d'un appel par rôle (avec fetch éventuel) en série.
            const welcomeRoleIds = [...new Set([settings?.welcome?.autorole, ...(settings?.welcome?.roles || [])].filter(Boolean))];
            if (welcomeRoleIds.length) {
                const resolved = await Promise.all(welcomeRoleIds.map(roleId =>
                    guild.roles.cache.get(roleId) || guild.roles.fetch(roleId).catch(() => null)));
                const rolesToAdd = resolved.filter(Boolean);
                if (rolesToAdd.length) await member.roles.add(rolesToAdd).catch(() => {});
            }

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

            if (settings?.welcome?.enabled && settings?.welcome?.channel) {
                const welcomeChannel = guild.channels.cache.get(settings.welcome.channel);
                if (welcomeChannel) {
                    let msgContent = null;
                    if (settings.welcome.message) {
                        msgContent = settings.welcome.message
                            .replace(/{user}/g, () => `<@${member.id}>`)
                            .replace(/{server}/g, () => guild.name)
                            .replace(/{memberCount}/g, () => String(guild.memberCount));
                    }

                    await welcomeChannel.send({
                        content: msgContent || `<@${member.id}>`,
                    }).catch(() => {});
                }
            }

        } catch (err) {
            Logger.error('[guildMemberAdd] Erreur:', { message: err.message, stack: err.stack });
        }
    },
};
