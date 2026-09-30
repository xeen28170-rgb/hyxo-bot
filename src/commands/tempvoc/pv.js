'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { ChannelType } = require('discord.js');
const { getGuildSettings } = require('../../utils/guildSettings');
const { getAccessLevel, applyPrivateVoice, LEVEL } = require('../../utils/privateVoice');

module.exports = {
    name: 'pv',
    category: 'tempvoc',
    description: 'Rend le salon vocal dans lequel vous êtes privé.',
    usage: '=pv',
    cooldown: 3,
    botPermissions: ['ManageRoles', 'MoveMembers'],
    async run(client, message) {
        const channel = message.member?.voice?.channel;
        if (!channel || channel.type !== ChannelType.GuildVoice) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Vous devez être dans un salon vocal pour utiliser `=pv`.')] });
        }

        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);
        const level = await getAccessLevel(client, message.member, settings);

        // Accès : seuls WL, Owner et propriétaire du bot.
        if (level < LEVEL.WL) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Réservé aux membres WL, Owner et au propriétaire du bot.')] });
        }

        let pv;
        try {
            ({ pv } = await applyPrivateVoice(client, channel, message.member, settings));
        } catch (error) {
            // Affiche le message d'erreur métier (ex: "Ce salon est deja prive.") proprement
            // au lieu de le laisser remonter vers le handler générique de commande, qui
            // affichait un "Une erreur est survenue" générique et peu clair.
            return message.channel.send({ embeds: [EmbedHelper.error(`❌ ${error.message}`)] });
        }

        const desc = [
            `**Salon:** <#${channel.id}>`,
            `**Rendu privé par:** ${message.member} (${pv.accessLevel})`,
            '',
            pv.accessLevel === 'Owner Bot'
                ? '_Tout le monde peut rejoindre ce vocal prive._'
                : pv.accessLevel === 'Owner'
                    ? '_Le proprietaire du bot et les Owners peuvent rejoindre. Les WL et les membres doivent etre autorises avec_ `=acces`_.'
                    : '_Le proprietaire du bot et les Owners peuvent rejoindre. Les WL et les membres doivent etre autorises avec_ `=acces`_.',
            '',
            'Le salon redeviendra public automatiquement dès que vous le quittez.',
        ].join('\n');

        return message.channel.send({ embeds: [EmbedHelper.success('🔒 Salon privé activé', desc)] });
    },
};
