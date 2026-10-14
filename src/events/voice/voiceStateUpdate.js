'use strict';

const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const TempVoice = require('../../models/TempVoice');
const Leash = require('../../models/Leash');
const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { getGuildSettings } = require('../../utils/guildSettings');
const { restorePublicVoice, revokeTemporaryAccess, PrivateVoice, getAccessLevel, canJoinPrivateVoiceByLevel } = require('../../utils/privateVoice');
const { sendPanel, scheduleRefresh } = require('../../utils/tempvoicePanel');

// Membres dont un salon temporaire est en cours de création : évite les doublons si la
// personne re-clique vite sur le salon "créer" avant que le premier soit enregistré.
const creatingTempVoc = new Set();

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
    const oldChannelId = oldState.channelId;
    if (!oldChannelId) return;
    if (oldChannelId === newState.channelId) return;

    const pv = await PrivateVoice.findOne({ channelId: oldChannelId });
    if (!pv) return;
    // Quelqu'un d'autre part : s'il était là avant le =pv, il perd son accès temporaire.
    if (oldState.member?.id !== pv.ownerId) {
        const channel = guild.channels.cache.get(oldChannelId);
        await revokeTemporaryAccess(channel, pv, oldState.member?.id).catch(() => {});
        return;
    }
    // Seul le départ du propriétaire du PV déclenche la restauration.

    // La purge de l'enregistrement doit TOUJOURS avoir lieu, même si la restauration
    // échoue (ex: salon détruit entre-temps par le nettoyage tempvoc plus bas dans ce
    // fichier) : sinon le salon reste marqué "privé" pour toujours en base et =pv
    // refuse indéfiniment de le réactiver.
    try {
        const channel = guild.channels.cache.get(oldChannelId)
            || await guild.channels.fetch(oldChannelId).catch(() => null);
        await restorePublicVoice(channel, pv);
    } catch (e) {
        console.error('[PrivateVoice] Erreur restauration:', e?.message);
    } finally {
        await PrivateVoice.deleteOne({ channelId: oldChannelId }).catch(() => {});
    }
}

module.exports = {
    name: 'voiceStateUpdate',
    async run(client, oldState, newState) {
        const guild = oldState.guild;
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        await handleLeash(client, oldState, newState);
        // Non bloquant : la restauration d'un PV (plusieurs appels Discord) ne doit pas retarder
        // la création d'un vocal temporaire quand on passe d'un PV au salon "créer".
        // La fonction a son propre try/catch, donc aucun rejet non géré.
        void handlePrivateVoiceLeave(guild, oldState, newState);

        const settings = await getGuildSettings(client, guild.id);

        // Enforcement runtime des PV : vérifie que la personne a le droit d'entrer
        // (utile si un admin déplace quelqu'un dans un PV via Discord, ce qui bypass Connect).
        if (newState.channelId && oldState.channelId !== newState.channelId) {
            const pv = await PrivateVoice.findOne({ channelId: newState.channelId });
            if (pv && pv.ownerId !== member.id) {
                const isPermitted = (pv.permitted || []).includes(member.id);
                if (!isPermitted) {
                    const pvOwnerLevel = { 'Owner Bot': 3, Owner: 2, WL: 1 }[pv.accessLevel];
                    const joinerLevel = await getAccessLevel(client, member, settings);
                    const mayJoin = canJoinPrivateVoiceByLevel(pvOwnerLevel, joinerLevel);
                    if (!mayJoin) {
                        await member.voice.setChannel(null, 'PV : accès non autorisé').catch(() => {});
                        return;
                    }
                }
            }
        }

        if (settings.tempvoc?.enabled) {
            if (newState.channelId === settings.tempvoc.createChannel) {
                let createdChannel = null;
                const creationKey = `${guild.id}:${member.id}`;
                if (creatingTempVoc.has(creationKey)) return;
                creatingTempVoc.add(creationKey);
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
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect],
                            },
                        ],
                    });
                    createdChannel = channel;

                    // On enregistre le salon AVANT de déplacer le membre : s'il repart aussitôt,
                    // l'événement de départ retrouve l'entrée et supprime le salon vide
                    // (sinon il restait orphelin indéfiniment).
                    await TempVoice.create({
                        guildId: guild.id,
                        channelId: channel.id,
                        ownerId: member.id,
                        name: channelName,
                    });
                    await member.voice.setChannel(channel);

                    // Envoie le panneau de contrôle à boutons dans le vocal créé.
                    await sendPanel(guild, channel);
                } catch (error) {
                    console.error('Error creating tempvoc:', error);
                    // Si la création du salon a réussi mais que le membre a quitté le
                    // vocal entre-temps (setChannel a échoué), on supprime le salon
                    // orphelin pour ne pas l'accumuler indéfiniment.
                    if (createdChannel) {
                        await createdChannel.delete('Membre indisponible (création interrompue)').catch(() => {});
                        await TempVoice.deleteOne({ channelId: createdChannel.id }).catch(() => {});
                    }
                } finally {
                    creatingTempVoc.delete(creationKey);
                }
            }

            if (oldState.channelId && oldState.channelId !== newState.channelId) {
                const tempVoc = await TempVoice.findOne({ channelId: oldState.channelId });
                if (tempVoc) {
                    const oldChannel = guild.channels.cache.get(oldState.channelId)
                        || await guild.channels.fetch(oldState.channelId).catch(() => null);
                    if (oldChannel && oldChannel.members.size === 0) {
                        await oldChannel.delete().catch(() => {});
                        await TempVoice.deleteOne({ channelId: oldState.channelId });
                    } else if (oldChannel) {
                        scheduleRefresh(oldChannel);
                    }
                }
            }
            // Arrivée dans un vocal temporaire existant : compteur de membres du panneau à jour.
            if (newState.channelId && newState.channelId !== oldState.channelId && newState.channelId !== settings.tempvoc.createChannel) {
                if (await TempVoice.findOne({ channelId: newState.channelId }) && newState.channel) scheduleRefresh(newState.channel);
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
