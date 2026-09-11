'use strict';

// Catégories considérées comme « administratives » : adminRoles y donne accès sans
// permission Discord native. Les commandes purement utilitaires / d'information sont
// exclues (pas de privilèges supplémentaires hors des commandes prévues).
const ADMIN_CATEGORIES = new Set([
    'automod', 'backup', 'config', 'custom', 'gestion', 'logs',
    'moderation', 'moderation_config', 'tempvoc', 'tickets',
    'giveaway', 'owners',
]);

// modRoles ne couvre que les commandes de modération « simples » (jamais un doublon des
// permissions Discord natives : un rôle mod donne accès sans la permission native).
const MODERATION_PERMISSIONS = new Set([
    'ManageMessages',
    'KickMembers',
    'BanMembers',
    'ModerateMembers',
    'MuteMembers',
    'MoveMembers',
]);

function isDangerousPrivilegedCommand(command) {
    return !!(command.ownerOnly || command.serverOwnerOnly);
}

// adminRoles couvre toute commande d'administration prévue, à l'exception des commandes
// purement utilitaires sans permission (info publique) et des commandes réservées.
function isAdminRoleCommand(command) {
    if (isDangerousPrivilegedCommand(command)) return false;
    if (ADMIN_CATEGORIES.has(command.category)) return true;
    return Array.isArray(command.permissions) && command.permissions.length > 0;
}

function isModerationRoleCommand(command) {
    if (isDangerousPrivilegedCommand(command)) return false;
    if (command.category !== 'moderation') return false;
    const perms = command.permissions || [];
    return perms.length > 0 && perms.every(permission => MODERATION_PERMISSIONS.has(permission));
}

function hasCustomCommandPermission(settings, member, command) {
    // Défense en profondeur : aucun mécanisme custom ne contourne les commandes
    // réservées aux owners / propriétaires du serveur (déjà filtrées en amont).
    if (isDangerousPrivilegedCommand(command)) return false;

    const targetIds = new Set([member.id, ...member.roles.cache.keys()]);
    const permissions = settings?.permissions || {};
    const keys = [
        command.name,
        ...(command.aliases || []),
        ...(command.permissions || []),
    ].map(key => String(key).toLowerCase());

    const hasConfiguredOverride = keys.some(key =>
        (permissions[key] || []).some(id => targetIds.has(id))
    );
    if (hasConfiguredOverride) return true;

    const hasAdminRole = (settings?.adminRoles || []).some(roleId => member.roles.cache.has(roleId));
    const hasModRole = (settings?.modRoles || []).some(roleId => member.roles.cache.has(roleId));

    if (hasAdminRole && isAdminRoleCommand(command)) return true;
    if (hasModRole && isModerationRoleCommand(command)) return true;
    return false;
}

module.exports = {
    ADMIN_CATEGORIES,
    MODERATION_PERMISSIONS,
    isAdminRoleCommand,
    isModerationRoleCommand,
    isDangerousPrivilegedCommand,
    hasCustomCommandPermission,
};
