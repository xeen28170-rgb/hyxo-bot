'use strict';

const Blacklist = require('../../models/Blacklist');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const BlacklistService = require('../../services/blacklistService');
const SanctionCard = require('../../services/sanctionCard');

module.exports = {
    name: 'bl',
    category: 'owners',
    // Préfixe réservé : &bl, &unbl, &unblall (ne marche pas avec le préfixe normal).
    prefix: '&',
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

        const result = await BlacklistService.enforceUser(client, target.id);

        // Même présentation que le ban, avec la fiche de sanction.
        const embed = EmbedHelper.info(
            'Blacklist',
            `**${target.username}** a été ajouté à la blacklist du bot.\n**Serveurs** — banni de ${result.banned} serveur(s)${result.failed ? `, ${result.failed} à réessayer` : ''}\n**Raison** — ${reason}`,
            { color: EmbedHelper.Colors.ERROR },
        );
        embed.setThumbnail(target.displayAvatarURL({ dynamic: true }));
        embed.setFooter({ text: `ID : ${target.id}` });

        return SanctionCard.send(message.channel, embed, {
            type: 'blacklist', user: target, moderator: message.author, reason, duration: 'définitif',
        });
    },
};
