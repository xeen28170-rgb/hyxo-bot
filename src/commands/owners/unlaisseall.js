'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const LeashService = require('../../services/leashService');
const { getAccessLevel, LEVEL } = require('../../utils/privateVoice');
const { getGuildSettings } = require('../../utils/guildSettings');
const { mapLimit } = require('../../utils/concurrency');

module.exports = {
    name: 'unlaisseall',
    category: 'owners',
    description: 'Libère toutes les personnes tenues en laisse (restaure tous les pseudos).',
    usage: '-unlaisseall',
    ownerOnly: false,
    async run(client, message) {
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const level = await getAccessLevel(client, message.member, settings);
        const isBotOwner = level === LEVEL.BOT_OWNER;

        if (level < LEVEL.OWNER) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Vous devez être owner du serveur ou du bot pour utiliser cette commande.')] });
        }

        const leashes = await LeashService.listLeashes();

        // Une action globale (tous serveurs confondus) n'est autorisée qu'au owner du bot.
        // Un simple owner de serveur ne doit pouvoir libérer que les laisses impliquant
        // SON serveur (le pseudo y est restauré, pas ailleurs).
        const filtered = isBotOwner
            ? leashes
            : leashes.filter(l => (l.guildIds || []).includes(message.guild.id));

        if (!filtered.length) {
            return message.channel.send({ embeds: [EmbedHelper.info('🐕 Libération', 'Aucune personne tenue en laisse pour le moment.')] });
        }

        let success = 0;
        let failed = 0;
        const errors = [];

        await mapLimit(filtered, async (leash) => {
            try {
                const target = { id: leash.userId };
                await LeashService.stopLeash(client, target, isBotOwner ? null : message.guild.id);
                success++;
            } catch (err) {
                failed++;
                errors.push(`<@${leash.userId}> : ${err.message || err}`);
            }
        }, 3);

        if (failed === 0) {
            return message.channel.send({
                embeds: [EmbedHelper.success(`🐕 **${success}** laisse(s) retirée(s) avec succès. Tous les pseudos ont été restaurés.`)],
            });
        }

        return message.channel.send({
            embeds: [EmbedHelper.error([
                `⚠️ **${success}** laisse(s) retirée(s), **${failed}** erreur(s) :`,
                ...errors,
            ].join('\n').slice(0, 4000))],
        });
    },
};
