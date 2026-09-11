'use strict';

const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const TempVoice = require('../../models/TempVoice');
const Leash = require('../../models/Leash');
const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { getGuildSettings } = require('../../utils/guildSettings');
const { restorePublicVoice, PrivateVoice } = require('../../utils/privateVoice');
const { sendPanel } = require('../../utils/tempvoicePanel');

async function handleLeash(client, oldState, newState) {
    try {
        const guild = oldState.guild;
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        const newChannelId = newState.channelId;
        const oldChannelId = oldState.channelId;
        if (!newChannelId) return;

        // 1) Si la personne déplacée est une cible (suivie), on la ramène chez son follower.
        const leash = await Leash.get({ userId: member.id });
        if (leash?.followerId) {
            const follower = guild.members.cache.get(leash.followerId) || await guild.members.fetch(leash.followerId).catch(() => null);
            if (follower?.voice?.channelId) {
                if (newChannelId !== follower.voice.channelId) {
                    await member.voice.setChannel(follower.voice.channelId, 'Laisse: retour auprès du maître').catch(() => {});
                }
            }
            return;
        }

        // 2) Si la personne déplacée est un follower, ses cibles le suivent.
        const targets = await Leash.findByFollower({ followerId: member.id });
        if (targets.length && oldChannelId && oldChannelId !== newChannelId) {
            for (const t of targets) {
                const target = guild.members.cache.get(t.userId) || await guild.members.fetch(t.userId).catch(() => null);
                if (!target) continue;
                if (target?.voice?.channelId && target.voice.channelId !== newChannelId) {
                    await target.voice.setChannel(newChannelId, 'Laisse: suite de son maître').catch(() => {});
                }
            }
        }
    } catch (e) {
        console.error('[Leash] Erreur handleLeash:', e.message);
    }
}

// Quand le propriétaire d'un PV quitte son salon, on restaure le salon public
// et on purge les permissions spécifiques (aucune commande nécessaire).
async function handlePrivateVoiceLeave(guild, oldState, newState) {
    try {
        const oldChannelId = oldState.channelId;
        if (!oldChannelId) return;
        if (oldChannelId === newState.channelId) return;

        const pv = await PrivateVoice.findOne({ channelId: oldChannelId });
        if (!pv) return;
        // Seul le départ du propriétaire du PV déclenche la restauration.
        if (oldState.member?.id !== pv.ownerId) return;

        const channel = guild.channels.cache.get(oldChannelId)
            || await guild.channels.fetch(oldChannelId).catch(() => null);
        await restorePublicVoice(channel, pv);
        await PrivateVoice.deleteOne({ channelId: oldChannelId });
    } catch (e) {
        console.error('[PrivateVoice] Erreur restauration:', e?.message);
    }
}

module.exports = {
    name: 'voiceStateUpdate',
    async run(client, oldState, newState) {
        const guild = oldState.guild;
        const member = oldState.member;
        if (!member || member.user.bot) return;

        await handleLeash(client, oldState, newState);
        await handlePrivateVoiceLeave(guild, oldState, newState);

        const settings = await getGuildSettings(client, guild.id);

        if (settings.tempvoc?.enabled) {
            if (newState.channelId === settings.tempvoc.createChannel) {
                try {
                    // Idempotence : si le membre possède déjà une salle temporaire active,
                    // on l'y déplace au lieu d'en créer une nouvelle (évite les doublons).
                    const existing = await TempVoice.findOne({ guildId: guild.id, ownerId: member.id });
                    if (existing?.channelId) {
                        const existingChannel = guild.channels.cache.get(existing.channelId)
                            || await guild.channels.fetch(existing.channelId).catch(() => null);
                        if (existingChannel) {
                            await member.voice.setChannel(existingChannel).catch(() => {});
                            return;
                        }
                        // Le salon référencé n'existe plus → on le nettoie et on continue la création.
                        await TempVoice.deleteOne({ channelId: existing.channelId });
                    }

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

                    // Envoie le panneau de contrôle à boutons dans le vocal créé.
                    await sendPanel(guild, channel, member);
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
