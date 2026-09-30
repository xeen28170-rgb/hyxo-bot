'use strict';

const Owner = require('../../models/Owner');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'owner',
    category: 'owners',
    description: 'Gérer les propriétaires du bot.',
    usage: '-owner <add|remove|list> <utilisateur|rôle>',
    ownerOnly: false,
    async run(client, message, args) {
        const Guild = require('../../models/Guild');
        const PermissionsHelper = require('../../utils/permissions');
        
        const isCreator = PermissionsHelper.isBotOwner(client, message.author.id);

        const sub = args[0]?.toLowerCase();

        // ─── OWNER GLOBAL (créateur du bot uniquement) ───
        if (sub === 'global') {
            if (!PermissionsHelper.isCreator(message.author.id) && !PermissionsHelper.isProprietaire(message.author.id)) return message.channel.send({ embeds: [EmbedHelper.error('Seul le créateur du bot peut gérer les privilèges globaux.')] });
            
            const action = args[1]?.toLowerCase();
            if (action === 'add') {
                const user = await Helpers.resolveUser(client, args[2]);
                if (!user) return message.channel.send({ embeds: [EmbedHelper.error('Utilisateur invalide.')] });
                await Owner.findOneAndUpdate({ userId: user.id }, { addedBy: message.author.id, level: 1 }, { upsert: true });
                client.owners.add(user.id);
                return message.channel.send({ embeds: [EmbedHelper.success(`${user.tag} est maintenant propriétaire GLOBAL du bot.`)] });
            }
            if (action === 'remove' || action === 'del') {
                const user = await Helpers.resolveUser(client, args[2]);
                if (!user) return message.channel.send({ embeds: [EmbedHelper.error('Utilisateur invalide.')] });
                await Owner.findOneAndDelete({ userId: user.id });
                client.owners.delete(user.id);
                return message.channel.send({ embeds: [EmbedHelper.success(`${user.tag} n'est plus propriétaire GLOBAL du bot.`)] });
            }
            const owners = Array.from(client.owners);
            return message.channel.send({ embeds: [EmbedHelper.info('👑 Owners Globaux', owners.map(id => `<@${id}> (\`${id}\`)`).join('\n') || 'Aucun.', { color: 0xFF0000 })] });
        }

        if (!isCreator) {
            return message.channel.send({ embeds: [EmbedHelper.error('Seul le proprietaire du bot peut gerer les Owners.')] });
        }

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);

        // ─── ADD ───
        if (sub === 'add') {
            const target = args[1];
            if (!target) return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-owner add <utilisateur|rôle>`')] });

            // Vérifier si c'est un rôle
            const role = Helpers.resolveRole(message.guild, target);
            if (role) {
                if (settings.ownerRoles?.includes(role.id)) {
                    return message.channel.send({ embeds: [EmbedHelper.error('Ce rôle est déjà owner.')] });
                }
                await Guild.updateOne({ guildId: message.guild.id }, { $addToSet: { ownerRoles: role.id } });
                invalidateGuildSettings(client, message.guild.id);
                return message.channel.send({ embeds: [EmbedHelper.success(`Le rôle **${role.name}** est maintenant owner de ce serveur.`)] });
            }

            // Sinon, chercher un utilisateur
            const user = await Helpers.resolveUser(client, target);
            if (!user) return message.channel.send({ embeds: [EmbedHelper.error('Utilisateur ou rôle invalide.')] });
            if (settings.owners?.includes(user.id)) return message.channel.send({ embeds: [EmbedHelper.error('Déjà owner.')] });

            await Guild.updateOne({ guildId: message.guild.id }, { $addToSet: { owners: user.id } });
            invalidateGuildSettings(client, message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`${user.tag} est maintenant owner de ce serveur.`)] });
        }

        // ─── REMOVE ───
        if (sub === 'remove' || sub === 'del') {
            const target = args[1];
            if (!target) return message.channel.send({ embeds: [EmbedHelper.error('Usage: `-owner remove <utilisateur|rôle>`')] });

            // Vérifier si c'est un rôle
            const role = Helpers.resolveRole(message.guild, target);
            if (role) {
                if (!settings.ownerRoles?.includes(role.id)) {
                    return message.channel.send({ embeds: [EmbedHelper.error('Ce rôle n\'est pas owner.')] });
                }
                await Guild.updateOne({ guildId: message.guild.id }, { $pull: { ownerRoles: role.id } });
                invalidateGuildSettings(client, message.guild.id);
                return message.channel.send({ embeds: [EmbedHelper.success(`Le rôle **${role.name}** n'est plus owner de ce serveur.`)] });
            }

            // Sinon, chercher un utilisateur
            const userId = Helpers.resolveUserId(target);
            if (!userId) return message.channel.send({ embeds: [EmbedHelper.error('Utilisateur ou rôle invalide.')] });
            if (!settings.owners?.includes(userId)) return message.channel.send({ embeds: [EmbedHelper.error('Pas owner.')] });

            await Guild.updateOne({ guildId: message.guild.id }, { $pull: { owners: userId } });
            invalidateGuildSettings(client, message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`<@${userId}> n'est plus owner de ce serveur.`)] });
        }

        // ─── LIST ───
        const owners = settings.owners || [];
        const ownerRoles = settings.ownerRoles || [];
        const botOwnerIds = Array.from(client.botOwners);
        const botOwnerTag = botOwnerIds.length > 0 
            ? botOwnerIds.map(id => `<@${id}>`).join(', ')
            : 'Xeen';

        const embed = EmbedHelper.info('👑 Owners du Serveur', [
            `**Propriétaire du Bot:** ${botOwnerTag}`,
            '',
            `**Propriétaire du Serveur:** <@${message.guild.ownerId}>`,
            '',
            '**Owners additionnels:**',
            owners.length ? owners.map(id => `<@${id}>`).join('\n') : 'Aucun.',
            '',
            '**Rôles Owners:**',
            ownerRoles.length ? ownerRoles.map(id => `<@&${id}>`).join('\n') : 'Aucun.'
        ].join('\n'), { color: 0xFF0000 });

        message.channel.send({ embeds: [embed] });
    },
};
