'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'openmodmail',
    category: 'tickets',
    description: 'Ouvre un ticket manuellement avec un membre du serveur',
    usage: '<membre>',
    permissions: ['ManageMessages'],
    async run(client, message, args) {
        const member = await Helpers.resolveMember(message.guild, args[0]);
        if (!member) return message.channel.send({ embeds: [EmbedHelper.error('Membre introuvable.')] });
        if (member.user.bot) return message.channel.send({ embeds: [EmbedHelper.error('Impossible d\'ouvrir un ticket avec un bot.')] });

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const modmailCategory = settings.config?.modmailCategory;

        const category = modmailCategory ? message.guild.channels.cache.get(modmailCategory) : null;

        const ticketChannel = await message.guild.channels.create({
            name: `modmail-${member.user.username}`,
            parent: category || null,
            permissionOverwrites: [
                { id: message.guild.id, deny: ['ViewChannel'] },
                { id: member.id, deny: ['ViewChannel'] },
                { id: message.author.id, allow: ['ViewChannel', 'SendMessages'] },
            ],
        });

        ticketChannel.send({ embeds: [EmbedHelper.info(`📩 Modmail — ${member.user.tag}`, `Ticket ouvert manuellement par <@${message.author.id}>.\nLe membre ne recevra pas de notification tant qu'aucun message n'est envoyé.`, { color: 0xFF0000 })] });
        message.channel.send({ embeds: [EmbedHelper.success(`Ticket ouvert : <#${ticketChannel.id}>`)] });
    },
};
