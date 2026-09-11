'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const PermissionsHelper = require('../../utils/permissions');
const { getGuildSettings } = require('../../utils/guildSettings');
const { resolveLeashTarget } = require('../../utils/leashHelper');
const LeashService = require('../../services/leashService');
const { isWhitelisted } = require('../../utils/whitelist');

module.exports = {
    name: 'unlaisse',
    category: 'moderation',
    description: 'Libère une personne tenue en laisse et restaure son pseudo.',
    usage: '=unlaisse <@mention|ID>  (ou réponds à son message avec =unlaisse)',
    cooldown: 3,
    async run(client, message, args) {
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id, { create: false });
        if (!await canUseLeash(client, message, settings)) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Vous devez être whitelisté sur le bot pour utiliser cette commande.')] });
        }

        const target = await resolveLeashTarget(message, args);
        if (!target) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Mentionnez une personne (`@user`), fournissez son ID, ou répondez à son message pour utiliser `=unlaisse`.')] });
        }
        if (target.user.bot) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Impossible de retirer la laisse d\'un bot.')] });
        }

        const existing = await LeashService.getLeash(client, target.id);
        if (!existing) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Cette personne n\'est pas tenue en laisse.')] });
        }

        // Seul le propriétaire de la laisse (ou owner) peut relâcher.
        const isFollower = existing.followerId === message.author.id;
        const isOwner = PermissionsHelper.isBotOwner(client, message.author.id) || message.guild.ownerId === message.author.id || message.guildSettings?.owners?.includes(message.author.id) || message.guildSettings?.ownerRoles?.some(roleId => message.member.roles.cache.has(roleId));
        if (!isFollower && !isOwner) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Seul le maître de cette laisse peut la relâcher.')] });
        }

        await LeashService.stopLeash(client, target, message.guild.id);

        return message.channel.send({ embeds: [EmbedHelper.success(`**${target.displayName}** a été libérée de la laisse et a retrouvé son pseudo.`)] });
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
