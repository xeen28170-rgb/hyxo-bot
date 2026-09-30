'use strict';

const Permissions = require('./permissions');
const { hasCustomCommandPermission } = require('./commandPermissions');
const { getAccessLevel, LEVEL } = require('./privateVoice');

const RANKS = { laisse: LEVEL.WL, unlaisse: LEVEL.WL, pv: LEVEL.WL, wl: LEVEL.OWNER, pvlist: LEVEL.OWNER, unlaisseall: LEVEL.OWNER };

async function accessContext(client, member, settings, channelId) {
    return { client, member, settings: settings || {}, channelId, rank: await getAccessLevel(client, member, settings) };
}

function commandAccess(command, context, checkBot = true) {
    const { client, member, settings, channelId, rank } = context;
    if (!member) return 'Cette commande s’utilise sur un serveur.';
    const botOwner = Permissions.isBotOwner(client, member.id);
    const serverOwner = member.guild.ownerId === member.id || settings.owners?.includes(member.id);
    const restricted = settings.moderation?.publicCommands === false || settings.moderation?.restrictedChannels?.includes(channelId);
    if (restricted && !botOwner && !serverOwner && !member.permissions.has('ManageGuild')) return 'Les commandes sont désactivées dans ce salon.';
    if (command.ownerOnly && !botOwner) return 'Cette commande est réservée aux propriétaires du bot.';
    if (command.disabled && !botOwner) return 'Cette commande est désactivée.';
    if (command.serverOwnerOnly && !serverOwner && !botOwner) return 'Cette commande est réservée au propriétaire du serveur et aux owners.';
    if (RANKS[command.name] && rank < RANKS[command.name]) return RANKS[command.name] === LEVEL.WL ? 'Rang WL minimum requis.' : 'Rang Owner minimum requis.';
    if (['owner', 'delowner'].includes(command.name) && !botOwner) return 'Seul le propriétaire du bot peut gérer les Owners.';
    if (command.name === 'clearowners' && !Permissions.isCreator(member.id) && member.guild.ownerId !== member.id) return 'Seul le propriétaire du serveur peut retirer tous les Owners.';
    const prisonOwner = botOwner || serverOwner || rank >= LEVEL.OWNER;
    if (command.name === 'unprisonall' && !prisonOwner) return 'Rang Owner requis pour libérer tous les prisonniers.';
    if (command.name === 'unprison' && !prisonOwner && rank < LEVEL.WL) return 'Rang WL minimum requis.';
    if (!botOwner && command.permissions?.length && !member.permissions.has(command.permissions)
        && !hasCustomCommandPermission(settings, member, command)) return 'Permissions manquantes : ' + command.permissions.join(', ') + '.';
    if (checkBot && command.botPermissions?.length && !member.guild.members.me?.permissions.has(command.botPermissions)) return 'Permissions manquantes pour le bot : ' + command.botPermissions.join(', ') + '.';
    return null;
}

async function helpClient(client, member, settings, channelId, all = false) {
    if (all) return client;
    const context = await accessContext(client, member, settings, channelId);
    return { user: client.user, commands: client.commands.filter(command => !commandAccess(command, context, false)) };
}

module.exports = { accessContext, commandAccess, helpClient };
