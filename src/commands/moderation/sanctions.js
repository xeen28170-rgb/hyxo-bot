'use strict';

const Sanction = require('../../models/Sanction');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const Logger = require('../../utils/logger');

module.exports = {
    name: 'sanctions',
    category: 'moderation',
    description: 'Affiche ou gère les sanctions d\'un membre',
    usage: '-sanctions <membre> | del <caseId> | clear <membre> | clear all',
    permissions: ['ManageMessages'],
    async run(client, message, args) {
        try {
            const sub = args[0]?.toLowerCase();

            if (sub === 'del') {
                const caseId = parseInt(args[1]);
                const prefix = message.guildSettings?.prefix || client.prefix;
                if (!caseId) return message.channel.send({ embeds: [EmbedHelper.error(`❌ Usage: \`${prefix}sanctions del <caseId>\``)] });

                const all = await Sanction.find({ guildId: message.guild.id });
                const sanction = all.find(s => s.caseId === caseId);

                if (!sanction) return message.channel.send({ embeds: [EmbedHelper.error(`❌ Aucune sanction avec le cas #${caseId} trouvée.`)] });

                await Sanction.updateOne({ _id: sanction._id }, { active: false });
                return message.channel.send({ embeds: [EmbedHelper.success(`✅ Sanction #${caseId} supprimée avec succès.`)] });
            }

            if (sub === 'clear' && args[1]?.toLowerCase() === 'all') {
                const all = await Sanction.find({ guildId: message.guild.id });
                for (const s of all) {
                    await Sanction.updateOne({ _id: s._id }, { active: false });
                }
                return message.channel.send({ embeds: [EmbedHelper.success(`✅ Toutes les sanctions du serveur ont été supprimées (${all.length}).`)] });
            }

            if (sub === 'clear') {
                const target = await Helpers.resolveUser(client, args[1], message.guild);
                if (!target) return message.channel.send({ embeds: [EmbedHelper.error('❌ Membre introuvable.')] });

                const all = await Sanction.find({ guildId: message.guild.id, userId: target.id || target.user?.id });
                for (const s of all) {
                    await Sanction.updateOne({ _id: s._id }, { active: false });
                }
                return message.channel.send({ embeds: [EmbedHelper.success(`✅ Toutes les sanctions de **${target.user?.username || target.username}** ont été supprimées (${all.length}).`)] });
            }

            const userId = args[0];
            const user = userId
                ? await Helpers.resolveUser(client, userId, message.guild)
                : message.author;

            const targetId = user?.id || user?.user?.id || message.author.id;
            const targetTag = user?.user?.username || user?.username || message.author.username;

            const allSanctions = await Sanction.find({ guildId: message.guild.id, userId: targetId });
            const sanctions = allSanctions.sort((a, b) => b.createdAt - a.createdAt);

            if (!sanctions.length) {
                return message.channel.send({
                    embeds: [EmbedHelper.info(`📜 Sanctions de ${targetTag}`, 'Aucune sanction trouvée pour cet utilisateur.', { color: 0xFF0000 })],
                });
            }

            const typeEmojis = {
                warn: '⚠️', mute: '🔇', tempmute: '🔇', unmute: '🔊',
                kick: '👢', ban: '🔨', tempban: '🔨', unban: '✅',
                derank: '📉',
            };

            const description = sanctions.map((s, i) => {
                const emoji = typeEmojis[s.type] || '⚡';
                return `**Cas #${s.caseId || (sanctions.length - i)} | ${emoji} ${(s.type || 'inconnu').toUpperCase()}**\nPar: <@${s.moderatorId}>\nRaison: ${s.reason || 'Aucune'}\nDate: ${Helpers.formatDate(s.createdAt)}`;
            }).join('\n\n').slice(0, 4096);

            const embed = EmbedHelper.info(`📜 Sanctions de ${targetTag} (${sanctions.length})`, description, { color: 0xFF0000 });
            message.channel.send({ embeds: [embed] });

        } catch (err) {
            Logger.error('Erreur lors de la gestion des sanctions:', err);
            message.channel.send({ embeds: [EmbedHelper.error(`Une erreur est survenue : ${err.message}`)] });
        }
    },
};
