'use strict';

const Wet = require('../../models/Wet');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const WetService = require('../../services/wetService');
const SanctionCard = require('../../services/sanctionCard');

function helpLines() {
    return [
        '`&wet <@membre/ID> [raison]` : bannit la personne de tous les serveurs du bot',
        '`&wet liste` : personnes wet',
        '`&unwet <@membre/ID>` : la retire et la débannit partout',
        '`&unwetall` : retire tout le monde de la liste et débannit partout',
    ].join('\n');
}

module.exports = {
    name: 'wet',
    aliases: ['wetlist'],
    category: 'owners',
    // Préfixe réservé (&wet) et propriétaire du bot uniquement.
    prefix: '&',
    ownerOnly: true,
    proprietaireOnly: true,
    description: 'Bannit une personne de tous les serveurs du bot (rebannie si elle revient).',
    usage: '<@membre/ID> [raison] | liste',
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (!sub || ['liste', 'list'].includes(sub)) {
            const entries = await Wet.find();
            const list = entries.length
                ? entries.slice(0, 40).map(e => `<@${e.userId}> (\`${e.userId}\`) · ${e.reason || 'Aucune raison'}`).join('\n')
                : 'Personne n\'est wet.';
            return message.channel.send({
                embeds: [EmbedHelper.info(`Wet (${entries.length})`, list, { color: EmbedHelper.Colors.ERROR, fields: [{ name: 'Commandes', value: helpLines() }] })],
                allowedMentions: { parse: [] },
            });
        }

        const target = await Helpers.resolveUser(client, args[0]);
        const user = target?.user || target;
        if (!user?.id) return message.channel.send({ embeds: [EmbedHelper.error('Utilisateur introuvable. Usage : `&wet <@membre/ID> [raison]`.')] });
        if (user.id === message.author.id || user.id === client.user.id) {
            return message.channel.send({ embeds: [EmbedHelper.error('Impossible de wet cette personne.')] });
        }

        const reason = args.slice(1).join(' ') || 'Aucune raison spécifiée';
        await Wet.findOneAndUpdate({ userId: user.id }, { reason, moderatorId: message.author.id, createdAt: new Date() });
        const result = await WetService.enforceUser(client, user.id);

        // Même présentation que le ban, avec la fiche de sanction.
        const embed = EmbedHelper.info(
            'Wet',
            `**${user.username}** est banni de tous les serveurs du bot.\n**Serveurs** — banni de ${result.banned} serveur(s)${result.failed ? `, ${result.failed} à réessayer` : ''}\n**Raison** — ${reason}`,
            { color: EmbedHelper.Colors.ERROR },
        );
        embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
        embed.setFooter({ text: `ID : ${user.id}` });
        return SanctionCard.send(message.channel, embed, {
            type: 'wet', user, moderator: message.author, reason, duration: 'définitif',
        });
    },
};
