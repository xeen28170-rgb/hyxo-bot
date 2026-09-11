'use strict';

const Blacklist = require('../../models/Blacklist');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'bl',
    category: 'owners',
    ownerOnly: true,
    description: 'Blackliste un utilisateur sur le bot.',
    usage: '<@membre/ID>',
    async run(client, message, args) {
        if (!args[0]) {
            const list = await Blacklist.find();
            const embed = EmbedHelper.info('🛡️ Blacklist Globale', list.map(b => `<@${b.userId}> (\`${b.userId}\`) - ${b.reason}`).join('\n') || 'Aucun utilisateur blacklisté.', { color: 0xFF0000 });
            return message.channel.send({ embeds: [embed] });
        }

        const target = await Helpers.resolveUser(client, args[0]);
        if (!target) return message.channel.send({ embeds: [EmbedHelper.error('Utilisateur introuvable.')] });

        const reason = args.slice(1).join(' ') || 'Aucune raison spécifiée';

        await Blacklist.findOneAndUpdate(
            { userId: target.id },
            { reason, moderatorId: message.author.id, createdAt: new Date() },
            { upsert: true }
        );

        message.guild.members.ban(target.id, { reason: `[Blacklist Bot] ${reason}` }).catch(() => {});

        return message.channel.send({ embeds: [EmbedHelper.success(`<@${target.id}> a été ajouté à la blacklist.`)] });
    },
};
