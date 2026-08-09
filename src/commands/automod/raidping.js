'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'raidping',
    category: 'automod',
    description: 'Modifie les rôles mentionnés en cas de raid',
    usage: '<rôle>',
    permissions: ['Administrator'],
    async run(client, message, args) {
        const role = Helpers.resolveRole(message.guild, args.join(' '));
        if (!role) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez mentionner un rôle ou donner son ID.')] });

        await Guild.updateOne({ guildId: message.guild.id }, { 'antiraid.raidPingRole': role.id });
        return message.channel.send({ embeds: [EmbedHelper.success(`Le rôle <@&${role.id}> sera mentionné en cas de raid.`)] });
    },
};
