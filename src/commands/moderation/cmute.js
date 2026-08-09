'use strict';
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const PermissionsHelper = require('../../utils/permissions');
const Logger = require('../../utils/logger');

module.exports = {
    name: 'cmute',
    category: 'moderation',
    description: 'Mettre en sourdine vocal un membre.',
    usage: '+cmute <utilisateur> [durée] [raison]',
    permissions: ['MuteMembers'],
    botPermissions: ['MuteMembers'],
    cooldown: 5,
    async run(client, message, args) {
        if (!args[0]) return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${module.exports.usage}\``)] });

        const member = await Helpers.resolveMember(message.guild, args[0]);
        if (!member) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_user'))] });
        if (!member.voice.channel) return message.channel.send({ embeds: [EmbedHelper.error('❌ Ce membre n\'est pas dans un salon vocal.')] });
        if (!PermissionsHelper.canTarget(message.member, member)) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.higher_role'))] });

        let duration = null, reasonStart = 1;
        const d = Helpers.parseDuration(args[1]);
        if (d) { duration = d; reasonStart = 2; }
        const reason = args.slice(reasonStart).join(' ') || message.t('general.no_reason');

        await member.voice.setMute(true, `${message.author.tag} | ${reason}`);

        if (duration) {
            setTimeout(async () => {
                try {
                    const m = await message.guild.members.fetch(member.id).catch(() => null);
                    if (m?.voice.serverMute) await m.voice.setMute(false, 'Cmute expiré').catch(() => {});
                } catch (err) {
                    Logger.error('cmute timeout error:', err);
                }
            }, duration);
        }

        const msg = message.t('moderation.cmute.success', { user: member.user.tag, channel: member.voice.channel.name });
        await message.channel.send({ embeds: [EmbedHelper.success(`${msg}\n**Raison:** ${reason}${duration ? `\n**Durée:** ${Helpers.formatDuration(duration)}` : ''}`)] });
    },
};
