'use strict';
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const Sanction = require('../../models/Sanction');

module.exports = {
    name: 'uncmute',
    category: 'moderation',
    description: 'Retirer la sourdine vocal d\'un membre.',
    usage: '-uncmute <utilisateur>',
    permissions: ['MuteMembers'],
    botPermissions: ['MuteMembers'],
    cooldown: 5,
    async run(client, message, args) {
        if (!args[0]) return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${module.exports.usage}\``)] });
        const member = await Helpers.resolveMember(message.guild, args[0]);
        if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });
        if (!member.voice.channel) return message.channel.send({ embeds: [EmbedHelper.error('❌ Ce membre n\'est pas dans un salon vocal.')] });

        const reason = 'Aucune raison fournie';
        await member.voice.setMute(false, `${message.author.tag} | ${reason}`);
        for (const sanction of await Sanction.find({ guildId: message.guild.id, userId: member.id, active: true })) {
            if (['cmute', 'tempcmute'].includes(sanction.type)) await Sanction.updateOne({ _id: sanction._id }, { active: false });
        }
        message.channel.send({ embeds: [EmbedHelper.success(message.t('moderation.cmute.uncmute_success', { user: member.user.tag, reason }))] });
    },
};
