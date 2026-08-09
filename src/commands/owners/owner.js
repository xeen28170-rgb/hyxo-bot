'use strict';

const Owner = require('../../models/Owner');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'owner',
    category: 'owners',
    description: 'Gérer les propriétaires du bot.',
    usage: '+owner <add|remove|list> <utilisateur>',
    ownerOnly: false, // On gère les permissions à l'intérieur
    async run(client, message, args) {
        const Guild = require('../../models/Guild');
        const PermissionsHelper = require('../../utils/permissions');
        
        const isCreator = PermissionsHelper.isCreator(message.author.id);
        const isGuildOwner = PermissionsHelper.isGuildOwner(message.member);

        const sub = args[0]?.toLowerCase();

        if (sub === 'global') {
            if (!isCreator) return message.channel.send({ embeds: [EmbedHelper.error('Seul le créateur du bot peut gérer les privilèges globaux.')] });
            
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

        if (!isCreator && !isGuildOwner) {
            return message.channel.send({ embeds: [EmbedHelper.error('Seul le propriétaire du serveur (👑) peut gérer les owners de ce serveur.')] });
        }

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);

        if (sub === 'add') {
            const user = await Helpers.resolveUser(client, args[1]);
            if (!user) return message.channel.send({ embeds: [EmbedHelper.error('Utilisateur invalide.')] });
            if (user.id === message.guild.ownerId) return message.channel.send({ embeds: [EmbedHelper.error('Le propriétaire est déjà owner.')] });
            if (settings.owners.includes(user.id)) return message.channel.send({ embeds: [EmbedHelper.error('Déjà owner.')] });

            await Guild.updateOne({ guildId: message.guild.id }, { $push: { owners: user.id } });
            return message.channel.send({ embeds: [EmbedHelper.success(`${user.tag} est maintenant owner de ce serveur.`)] });
        }

        if (sub === 'remove' || sub === 'del') {
            const user = await Helpers.resolveUser(client, args[1]);
            if (!user) return message.channel.send({ embeds: [EmbedHelper.error('Utilisateur invalide.')] });
            if (!settings.owners.includes(user.id)) return message.channel.send({ embeds: [EmbedHelper.error('Pas owner.')] });

            await Guild.updateOne({ guildId: message.guild.id }, { $pull: { owners: user.id } });
            return message.channel.send({ embeds: [EmbedHelper.success(`${user.tag} n'est plus owner de ce serveur.`)] });
        }

        const owners = settings.owners || [];
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
            owners.length ? owners.map(id => `<@${id}>`).join('\n') : 'Aucun.'
        ].join('\n'), { color: 0xFF0000 });

        message.channel.send({ embeds: [embed] });
    },
};
