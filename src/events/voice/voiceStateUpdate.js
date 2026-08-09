'use strict';

const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const TempVoice = require('../../models/TempVoice');
const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'voiceStateUpdate',
    async run(client, oldState, newState) {
        const guild = oldState.guild;
        const member = oldState.member;
        if (!member || member.user.bot) return;

        const settings = await getGuildSettings(client, guild.id);

        if (settings.tempvoc?.enabled) {
            if (newState.channelId === settings.tempvoc.createChannel) {
                try {
                    const channelName = settings.tempvoc.defaultName?.replace('{user}', member.user.username) || `${member.user.username}'s Channel`;
                    
                    const newStateChannel = newState.channel || await guild.channels.fetch(newState.channelId).catch(() => null);

                    const channel = await guild.channels.create({
                        name: channelName,
                        type: ChannelType.GuildVoice,
                        parent: settings.tempvoc.category || newStateChannel?.parentId || null,
                        permissionOverwrites: [
                            {
                                id: member.id,
                                allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect],
                            },
                        ],
                    });

                    await member.voice.setChannel(channel);
                    await TempVoice.create({
                        guildId: guild.id,
                        channelId: channel.id,
                        ownerId: member.id,
                        name: channelName,
                    });
                } catch (error) {
                    console.error('Error creating tempvoc:', error);
                }
            }

            if (oldState.channelId && oldState.channelId !== newState.channelId) {
                const tempVoc = await TempVoice.findOne({ channelId: oldState.channelId });
                if (tempVoc) {
                    const oldChannel = guild.channels.cache.get(oldState.channelId);
                    if (oldChannel && oldChannel.members.size === 0) {
                        await oldChannel.delete().catch(() => {});
                        await TempVoice.deleteOne({ channelId: oldState.channelId });
                    }
                }
            }
        }

        scheduleStatsUpdate(client, guild, 'voice', 15_000);

        if (!oldState.channelId && newState.channelId) {
            const embed = EmbedHelper.info('🎙️ Connexion Vocal', [
                `**Membre:** ${member.user} (\`${member.id}\`)`,
                `**Salon:** <#${newState.channelId}>`
            ].join('\n'), { color: 0xFF0000 })
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            return LogDispatcher.voice(guild, embed);
        }

        if (oldState.channelId && !newState.channelId) {
            const embed = EmbedHelper.info('🎙️ Déconnexion Vocal', [
                `**Membre:** ${member.user} (\`${member.id}\`)`,
                `**Salon:** <#${oldState.channelId}>`
            ].join('\n'), { color: 0xFF0000 })
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            return LogDispatcher.voice(guild, embed);
        }

        if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            const embed = EmbedHelper.info('🎙️ Déplacement Vocal', [
                `**Membre:** ${member.user} (\`${member.id}\`)`,
                `**De:** <#${oldState.channelId}>`,
                `**À:** <#${newState.channelId}>`
            ].join('\n'), { color: 0xFF0000 })
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            return LogDispatcher.voice(guild, embed);
        }
    },
};
