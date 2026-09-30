'use strict';
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const PermissionsHelper = require('../../utils/permissions');
const ModerationService = require('../../services/moderationService');
const Sanction = require('../../models/Sanction');

module.exports = {
    name: 'cmute',
    category: 'moderation',
    description: 'Mettre en sourdine vocal un membre.',
    usage: '-cmute <utilisateur> [durée] [raison]',
    permissions: ['MuteMembers'],
    botPermissions: ['MuteMembers'],
    cooldown: 5,
    async run(client, message, args) {
        if (!args[0]) {
            const prefix = message.guildSettings?.prefix || client.prefix;
            return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${prefix}cmute <utilisateur> [durée] [raison]\``)] });
        }

        const member = await Helpers.resolveMember(message.guild, args[0]);
        if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });
        if (!member.voice.channel) return message.channel.send({ embeds: [EmbedHelper.error('❌ Ce membre n\'est pas dans un salon vocal.')] });
        if (!PermissionsHelper.canTarget(message.member, member)) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.higher_role'))] });

        let duration = null, reasonStart = 1;
        const d = Helpers.parseDuration(args[1]);
        if (d) { duration = d; reasonStart = 2; }
        const reason = args.slice(reasonStart).join(' ') || message.t('general.no_reason');

        await member.voice.setMute(true, `${message.author.tag} | ${reason}`);

        const previous = await Sanction.find({ guildId: message.guild.id, userId: member.id, active: true });
        await ModerationService.createSanction({ guildId: message.guild.id, userId: member.id, moderatorId: message.author.id,
            type: duration ? 'tempcmute' : 'cmute', duration, reason });
        for (const sanction of previous.filter(s => ['cmute', 'tempcmute'].includes(s.type))) {
            await Sanction.updateOne({ _id: sanction._id }, { active: false });
        }

        const msg = message.t('moderation.cmute.success', { user: member.user.tag, channel: member.voice.channel.name });
        await message.channel.send({ embeds: [EmbedHelper.success(`${msg}\n**Raison:** ${reason}${duration ? `\n**Durée:** ${Helpers.formatDuration(duration)}` : ''}`)] });
    },
};
