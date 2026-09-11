'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');
const PrisonService = require('../../services/prisonService');
const { canPrisonCommand } = require('./prison');

module.exports = {
    name: 'unprison',
    category: 'moderation',
    description: 'Libérer un membre de prison (retire le rôle et la liste des prisonniers).',
    usage: '-unprison <@membre|ID> [raison]',
    botPermissions: ['ModerateMembers', 'ManageRoles'],
    cooldown: 5,
    aliases: ['unjail'],
    async run(client, message, args) {
        if (!args[0]) {
            return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${module.exports.usage}\``)] });
        }

        const member = await Helpers.resolveMember(message.guild, args[0]);
        if (!member) return message.channel.send({ embeds: [EmbedHelper.error('❌ Membre introuvable.')] });

        const settings = message.guildSettings || (await getGuildSettings(client, message.guild.id, { create: false }));
        if (!(await canPrisonCommand(message.member, member, settings))) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Vous devez être **WL** ou **Owner** pour utiliser cette commande.')] });
        }

        const reason = args.slice(1).join(' ') || 'Aucune raison fournie';

        const result = await PrisonService.release(client, message.guild, member, reason);
        if (!result.ok) {
            const messages = {
                not_configured: '❌ Le système de prison n\'est pas configuré.',
                role_missing: '❌ Le rôle de prison est introuvable sur ce serveur.',
                not_prisoner: `✅ ${member} **n'est pas** en prison.`,
            };
            return message.channel.send({ embeds: [EmbedHelper.error(messages[result.code] || '❌ Une erreur est survenue.')] });
        }

        return message.channel.send({ embeds: [EmbedHelper.success(`🔓 ${member} a été libéré de prison.\n**Raison :** ${reason}`)] });
    },
};