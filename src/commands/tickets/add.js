'use strict';

const Ticket = require('../../models/Ticket');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'add',
    aliases: ['del'],
    category: 'tickets',
    description: 'Ajoute ou retire un membre au ticket',
    usage: '<membre>',
    permissions: ['ManageMessages'],
    async run(client, message, args) {
        const ticket = await Ticket.findOne({ channelId: message.channel.id, status: { $ne: 'closed' } });
        if (!ticket) return message.channel.send({ embeds: [EmbedHelper.error('Ce salon n\'est pas un ticket ouvert.')] });

        const isRemove = message.content.trim().toLowerCase().startsWith(`${client.prefix}del`);
        const member = await Helpers.resolveMember(message.guild, args[0]);
        if (!member) return message.channel.send({ embeds: [EmbedHelper.error('Membre introuvable.')] });

        if (isRemove) {
            await message.channel.permissionOverwrites.edit(member.id, { ViewChannel: false });
            await Ticket.updateOne({ _id: ticket._id }, { $pull: { participants: member.id } });
            return message.channel.send({ embeds: [EmbedHelper.success(`**${member.user.tag}** a été retiré du ticket.`)] });
        }

        await message.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });
        await Ticket.updateOne({ _id: ticket._id }, { $addToSet: { participants: member.id } });
        await message.channel.send({ embeds: [EmbedHelper.success(`**${member.user.tag}** a été ajouté au ticket.`)] });
    },
};
