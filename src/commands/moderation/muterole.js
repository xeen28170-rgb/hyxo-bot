'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'muterole',
    aliases: ['setmuterole', 'set muterole'],
    category: 'moderation_config',
    description: 'Crée ou définit le rôle mute du serveur.',
    usage: '-muterole [rôle]  —  sans argument : crée et configure automatiquement',
    permissions: ['ManageRoles', 'ManageChannels'],
    async run(client, message, args) {
        let muteRole;

        // Si un rôle est fourni → on l'assigne directement (sans retoucher les perms)
        if (args[0]) {
            muteRole = Helpers.resolveRole(message.guild, args.join(' '));

            if (!muteRole) return message.channel.send({ embeds: [EmbedHelper.error('Rôle introuvable. Mentionnez-le ou donnez son ID/nom.')] });

            await Guild.updateOne({ guildId: message.guild.id }, { 'moderation.muteRole': muteRole.id });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Rôle mute défini sur **${muteRole.name}**.`)] });
        }

        // Sans argument → crée le rôle s'il n'existe pas, configure les perms dans tous les salons
        muteRole = message.guild.roles.cache.find(r => r.name === 'Muted');

        if (!muteRole) {
            try {
                muteRole = await message.guild.roles.create({
                    name: 'Muted',
                    color: '#818386',
                    permissions: [],
                    reason: `Création automatique du rôle mute — ${message.author.tag}`,
                });
            } catch (err) {
                return message.channel.send({ embeds: [EmbedHelper.error(`Impossible de créer le rôle : ${err.message}`)] });
            }
        }

        let updated = 0;
        for (const channel of message.guild.channels.cache.values()) {
            if (channel.isTextBased() || channel.isVoiceBased()) {
                await channel.permissionOverwrites.edit(muteRole, {
                    SendMessages: false,
                    AddReactions: false,
                    Connect: false,
                    Speak: false,
                }).catch(() => {});
                updated++;
            }
        }

        await Guild.updateOne({ guildId: message.guild.id }, { 'moderation.muteRole': muteRole.id });
        client.cache.invalidateGuild(message.guild.id);

        message.channel.send({ embeds: [EmbedHelper.success(`Rôle **${muteRole.name}** configuré sur **${updated}** salon(s) et enregistré comme rôle mute.`)] });
    },
};
