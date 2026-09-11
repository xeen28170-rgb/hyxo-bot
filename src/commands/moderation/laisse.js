'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const PermissionsHelper = require('../../utils/permissions');
const { getGuildSettings } = require('../../utils/guildSettings');
const { resolveLeashTarget } = require('../../utils/leashHelper');
const LeashService = require('../../services/leashService');
const { isWhitelisted } = require('../../utils/whitelist');
const { canLeashTarget } = require('../../utils/privateVoice');

module.exports = {
    name: 'laisse',
    category: 'moderation',
    description: 'Fait suivre à une personne tous vos déplacements vocaux et lui impose un pseudo (chienne de user🐕).',
    usage: '=laisse <@mention|ID>  (ou réponds à son message avec =laisse)',
    cooldown: 3,
    async run(client, message, args) {
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id, { create: false });

        // Accès : uniquement les membres whitelistés du serveur (ou owner/proprio).
        if (!await canUseLeash(client, message, settings)) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Vous devez être whitelisté sur le bot pour utiliser cette commande.')] });
        }

        const target = await resolveLeashTarget(message, args);
        if (!target) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Mentionnez une personne (`@user`), fournissez son ID, ou répondez à son message pour utiliser `=laisse`.')] });
        }
        if (target.user.bot) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Impossible de laisser un bot.')] });
        }
        if (target.id === message.author.id) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Vous ne pouvez pas vous mettre en laisse vous-même.')] });
        }
        if (!await canLeashTarget(client, message.member, target, settings)) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Vous ne pouvez pas laisser cette personne (protégée / hiérarchie).')] });
        }
        if (!PermissionsHelper.botCanTarget(message.guild, target)) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Le bot ne peut pas modifier cette personne (rôle trop haut).')] });
        }

        const existing = await LeashService.getLeash(client, target.id);
        if (existing) {
            return message.channel.send({ embeds: [EmbedHelper.error(`❌ <@${target.id}> est déjà tenue en laisse par <@${existing.followerId}>.`) ] });
        }

        const result = await LeashService.startLeash(client, message.member, target);

        const lines = [
            `**${target.displayName}** est maintenant en laisse par **${message.member.displayName}**.`,
            '',
            `**Pseudo imposé :** \`${result.forcedNick}\``,
            result.guildIds.length
                ? `**Suivra vos déplacements vocaux sur** ${result.guildIds.length} serveur(s).`
                : '⚠️ Vous devez être dans un vocal partagé pour le suivi.',
            '',
            '_Elle ne pourra pas changer son pseudo ni se déplacer dans un autre vocal._',
        ];
        return message.channel.send({ embeds: [EmbedHelper.success(lines.join('\n'))] });
    },
};

async function canUseLeash(client, message, settings) {
    if (PermissionsHelper.isBotOwner(client, message.author.id)) return true;
    if (!settings) return false;
    if (message.guild.ownerId === message.author.id) return true;
    if (Array.isArray(settings.owners) && settings.owners.includes(message.author.id)) return true;
    if (Array.isArray(settings.ownerRoles) && settings.ownerRoles.some(roleId => message.member.roles.cache.has(roleId))) return true;
    const wl = settings.antiraid?.whitelist || [];
    return isWhitelisted(message.member, message.author.id, wl);
}
