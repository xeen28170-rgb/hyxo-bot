'use strict';

const Blacklist = require('../../models/Blacklist');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'bl',
    category: 'owners',
    ownerOnly: true,
    description: 'Gérer la blacklist globale du bot',
    usage: '<add/del/info/list> <@membre/ID> [raison]',
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'unbl') {
            const target = await Helpers.resolveUser(client, args[1]);
            if (!target) return message.channel.send({ embeds: [EmbedHelper.error('Utilisateur introuvable.')] });
            await Blacklist.findOneAndDelete({ userId: target.id });
            return message.channel.send({ embeds: [EmbedHelper.success(`<@${target.id}> a été retiré de la blacklist.`)] });
        }

        if (sub === 'info' || sub === 'blinfo') {
            const target = await Helpers.resolveUser(client, args[1]);
            if (!target) return message.channel.send({ embeds: [EmbedHelper.error('Utilisateur introuvable.')] });
            const data = await Blacklist.findOne({ userId: target.id });
            if (!data) return message.channel.send({ embeds: [EmbedHelper.info('🛡️ Blacklist Info', `<@${target.id}> n'est pas blacklisté.`, { color: 0xFF0000 })] });
            const embed = EmbedHelper.info('🛡️ Blacklist Info', [
                `**Utilisateur:** <@${data.userId}> (\`${data.userId}\`)`,
                `**Raison:** ${data.reason}`,
                `**Modérateur:** <@${data.moderatorId}>`,
                `**Date:** ${Helpers.discordTimestamp(data.createdAt, 'f')}`,
            ].join('\n'), { color: 0xFF0000 });
            return message.channel.send({ embeds: [embed] });
        }

        if (sub === 'add' || (!sub && args[0])) {
            const target = await Helpers.resolveUser(client, args[1] || args[0]);
            const reason = args.slice(sub === 'add' ? 2 : 1).join(' ') || 'Aucune raison spécifiée';
            if (!target) return message.channel.send({ embeds: [EmbedHelper.error('Utilisateur introuvable.')] });
            
            await Blacklist.findOneAndUpdate(
                { userId: target.id },
                { reason, moderatorId: message.author.id, createdAt: new Date() },
                { upsert: true }
            );
            
            message.guild.members.ban(target.id, { reason: `[Blacklist Bot] ${reason}` }).catch(() => {});
            
            return message.channel.send({ embeds: [EmbedHelper.success(`<@${target.id}> a été ajouté à la blacklist.`)] });
        }

        if (sub === 'del' || sub === 'remove') {
            const target = await Helpers.resolveUser(client, args[1]);
            if (!target) return message.channel.send({ embeds: [EmbedHelper.error('Utilisateur introuvable.')] });
            await Blacklist.findOneAndDelete({ userId: target.id });
            return message.channel.send({ embeds: [EmbedHelper.success(`<@${target.id}> a été retiré de la blacklist.`)] });
        }

        if (sub === 'clear') {
            await Blacklist.deleteMany({});
            return message.channel.send({ embeds: [EmbedHelper.success('Blacklist vidée.')] });
        }

        const list = await Blacklist.find();
        const embed = EmbedHelper.info('🛡️ Blacklist Globale', list.map(b => `<@${b.userId}> (\`${b.userId}\`) - ${b.reason}`).join('\n') || 'Aucun utilisateur blacklisté.', { color: 0xFF0000 });
        message.channel.send({ embeds: [embed] });
    },
};
