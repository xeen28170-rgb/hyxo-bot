'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');
const { canManagePrivateVoice, PrivateVoice } = require('../../utils/privateVoice');

module.exports = {
    name: 'acces',
    category: 'tempvoc',
    description: 'Donne l\'accès à votre salon vocal privé à une ou plusieurs personnes.',
    usage: '=acces <ID ou @mention> [ID/@mention ...]',
    cooldown: 2,
    async run(client, message, args) {
        const channel = message.member?.voice?.channel;
        if (!channel) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Vous devez être dans le salon vocal privé pour utiliser `=acces`.')] });
        }

        const pv = await PrivateVoice.findOne({ channelId: channel.id });
        if (!pv) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Ce salon n\'est pas en PV.')] });
        }

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        if (!await canManagePrivateVoice(client, message.member, pv, settings)) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Seul le propriétaire de ce PV (ou un Owner) peut donner l\'accès.')] });
        }

        if (!args.length || !args[0]) {
            return message.channel.send({ embeds: [EmbedHelper.error('Usage: `=acces <ID ou @mention> [\u2026]`')] });
        }

        const added = [];
        const failed = [];
        for (const raw of args) {
            const id = Helpers.resolveUserId(raw);
            if (!id) { failed.push(raw); continue; }
            const member = await Helpers.resolveMember(message.guild, raw);
            if (!member) { failed.push(raw); continue; }

            try {
                await channel.permissionOverwrites.edit(member.id, { Connect: true, ViewChannel: true });
            } catch {
                failed.push(raw);
                continue;
            }
            await PrivateVoice.updateOne({ channelId: channel.id }, { $addToSet: { permitted: member.id } });
            added.push(member.user.tag);
        }

        const lines = [];
        if (added.length) lines.push(`✅ Accès donné à : ${added.join(', ')}`);
        if (failed.length) lines.push(`⚠️ Introuvables : ${failed.join(', ')}`);
        lines.push('', '_Ces personnes peuvent rejoindre le vocal même s\'il est en PV._');

        return message.channel.send({ embeds: [EmbedHelper.success('🔓 Accès salon privé', lines.join('\n'))] });
    },
};
