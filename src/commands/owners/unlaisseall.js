'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const LeashService = require('../../services/leashService');
const PermissionsHelper = require('../../utils/permissions');

module.exports = {
    name: 'unlaisseall',
    category: 'owners',
    description: 'Libère toutes les personnes tenues en laisse (restaure tous les pseudos).',
    usage: '-unlaisseall',
    ownerOnly: false,
    async run(client, message) {
        const isBotOwner = PermissionsHelper.isBotOwner(client, message.author.id);
        const isGuildOwner = message.guild.ownerId === message.author.id;
        const isServerOwner = message.guildSettings?.owners?.includes(message.author.id);
        const hasOwnerRole = message.guildSettings?.ownerRoles?.some(roleId => message.member.roles.cache.has(roleId));

        if (!isBotOwner && !isGuildOwner && !isServerOwner && !hasOwnerRole) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Vous devez être owner du serveur ou du bot pour utiliser cette commande.')] });
        }

        const leashes = await LeashService.listLeashes();
        if (!leashes.length) {
            return message.channel.send({ embeds: [EmbedHelper.info('🐕 Libération', 'Aucune personne tenue en laisse pour le moment.')] });
        }

        let success = 0;
        let failed = 0;
        const errors = [];

        for (const leash of leashes) {
            try {
                const target = { id: leash.userId };
                await LeashService.stopLeash(client, target, null);
                success++;
            } catch (err) {
                failed++;
                errors.push(`<@${leash.userId}> : ${err.message || err}`);
            }
        }

        if (failed === 0) {
            return message.channel.send({
                embeds: [EmbedHelper.success(`🐕 **${success}** laisse(s) retirée(s) avec succès. Tous les pseudos ont été restaurés.`)],
            });
        }

        return message.channel.send({
            embeds: [EmbedHelper.error([
                `⚠️ **${success}** laisse(s) retirée(s), **${failed}** erreur(s) :`,
                ...errors,
            ].join('\n').slice(0, 4000))],
        });
    },
};
