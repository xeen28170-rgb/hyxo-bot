'use strict';

const AntiraidService = require('../../services/antiraidService');
const EmbedHelper     = require('../../utils/embedBuilder');

module.exports = {
    name: 'lockdown',
    aliases: ['ld', 'unlockdown'],
    category: 'automod',
    description: 'Verrouille ou déverrouille tous les salons du serveur.',
    usage: '-lockdown | -unlockdown',
    permissions: ['ManageGuild'],
    botPermissions: ['ManageChannels'],

    async run(client, message) {
        const guild = message.guild;
        const settings = message.guildSettings;

        const usedAlias = message.content.trim().split(/\s+/)[0].replace(settings?.prefix || client.prefix, '').toLowerCase();
        const isUnlock = usedAlias === 'unlockdown';

        const reason = isUnlock ? 'Unlock manuel' : 'Lockdown manuel';
        const fullReason = `[${isUnlock ? 'UNLOCK' : 'LOCKDOWN'}] ${message.author.tag} — ${reason}`;

        const waiting = await message.channel.send({
            embeds: [EmbedHelper.info(
                isUnlock ? '🔓 Unlock en cours...' : '🔒 Lockdown en cours...',
                'Traitement des salons, merci de patienter.'
            )]
        }).catch(() => null);

        try {
            let count;
            if (isUnlock) {
                count = await AntiraidService.unlockGuild(client, guild, fullReason);
            } else {
                count = await AntiraidService.lockdownGuild(client, guild, settings, fullReason);
            }

            const embed = EmbedHelper.log({
                title: isUnlock ? '🔓 Serveur déverrouillé' : '🔒 Serveur en Lockdown',
                color: isUnlock ? 0x57F287 : 0xFF2222,
                fields: [
                    { name: '👤 Modérateur',  value: `${message.author} (\`${message.author.id}\`)`, inline: true },
                    { name: '📁 Salons',       value: `\`${count}\` salon(s) ${isUnlock ? 'déverrouillés' : 'verrouillés'}`, inline: true },
                    { name: '📝 Raison',       value: reason, inline: false },
                ],
            });

            if (waiting) await waiting.edit({ embeds: [embed] });
            else await message.channel.send({ embeds: [embed] }).catch(() => {});

        } catch (error) {
            const errEmbed = EmbedHelper.error(
                'Erreur Lockdown',
                `Une erreur est survenue : \`${error.message}\``
            );
            if (waiting) await waiting.edit({ embeds: [errEmbed] });
            else await message.channel.send({ embeds: [errEmbed] }).catch(() => {});
        }
    },
};
