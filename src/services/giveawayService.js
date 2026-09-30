'use strict';

const { getEmoji, findReaction } = require('../config/emojis');

const { EmbedBuilder } = require('discord.js');
const Giveaway = require('../models/Giveaway');
const Logger = require('../utils/logger');
const Helpers = require('../utils/helpers');
const LogDispatcher = require('../utils/logDispatcher');
const { getGuildSettings } = require('../utils/guildSettings');
const { withKey } = require('../utils/keyedQueue');
const { randomInt } = require('crypto');
const { giveawayEmbed } = require('../utils/giveawayPresentation');
const refreshTimers = new Map();

async function participantsFrom(reaction) {
    if (!reaction) return [];
    const ids = new Set();
    let after;
    for (;;) {
        const users = await reaction.users.fetch({ limit: 100, ...(after ? { after } : {}) });
        for (const user of users.values()) if (!user.bot) ids.add(user.id);
        if (users.size < 100) break;
        const last = users.last().id;
        if (last === after) break;
        after = last;
    }
    return [...ids];
}

const GiveawayService = {
    /**
     * Créer un giveaway
     */
    async create(client, channel, options) {
        const { prize, duration, hostId, requirements, guildId } = options;
        const endsAt = new Date(Date.now() + duration);

        const embed = giveawayEmbed({ ...options, endsAt });

        const msg = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        await msg.react(getEmoji('GIVEAWAY'));

        const giveaway = await Giveaway.create({
            guildId,
            channelId: channel.id,
            messageId: msg.id,
            hostId,
            prize,
            winners: options.winners || 1,
            requirements: requirements || {},
            endsAt,
        });

        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            const logEmbed = new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle('🎉 Giveaway créé')
                .setDescription(`**Prix:** ${prize}\n**Salon:** ${channel}\n**Fin:** ${Helpers.discordTimestamp(endsAt, 'f')}\n**Organisateur:** <@${hostId}>`)
                .setTimestamp();
            await LogDispatcher.giveaways(guild, logEmbed);
        }

        return giveaway;
    },

    /**
     * Sélectionne les gagnants parmi les participants en appliquant la blacklist et
     * l'éventuel rôle requis (requirements.role).
     */
    async pickWinners(client, giveaway, participants, guild) {
        if (!Array.isArray(participants) || participants.length === 0) return [];
        const blacklist = Array.isArray(giveaway.blacklist) ? giveaway.blacklist : [];
        const requiredRole = giveaway.requirements?.role || null;

        let eligible = participants.filter(p => !blacklist.includes(p));

        if (requiredRole && guild) {
            const resolved = [];
            for (const userId of eligible) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member && member.roles.cache.has(requiredRole)) resolved.push(userId);
            }
            eligible = resolved;
        }

        eligible = [...new Set(eligible)];
        for (let index = eligible.length - 1; index > 0; index--) {
            const other = randomInt(index + 1);
            [eligible[index], eligible[other]] = [eligible[other], eligible[index]];
        }
        return eligible.slice(0, giveaway.winners || 1);
    },

    /**
     * Terminer un giveaway
     */
    async end(client, giveaway) {
        return withKey(`giveaway:${giveaway._id}`, async () => {
            const current = await Giveaway.findOne({ _id: giveaway._id });
            if (current) return this.finish(client, current);
        });
    },

    async finish(client, giveaway) {
        if (giveaway.ended) return;

        const channel = client.channels.cache.get(giveaway.channelId)
            || await client.channels.fetch(giveaway.channelId).catch(() => null);
        const msg = channel ? await channel.messages.fetch(giveaway.messageId).catch(() => null) : null;
        if (!msg) {
            // Salon ou message supprimé : on clôt le giveaway, sinon le cron le retente
            // à chaque passage, indéfiniment.
            Logger.warn(`[Giveaway] ${giveaway._id} clôturé : message ou salon introuvable.`);
            await Giveaway.updateOne({ _id: giveaway._id }, { ended: true, active: false, endedAt: new Date() });
            return;
        }

        const reaction = findReaction(msg, 'GIVEAWAY');
        const participants = giveaway.drawnAt ? giveaway.participants : await participantsFrom(reaction);

        const guild = client.guilds.cache.get(giveaway.guildId);
        const winners = giveaway.drawnAt ? giveaway.winnerIds : await this.pickWinners(client, giveaway, participants, guild);

        // Conserver le tirage en cas d'echec de publication ou de redemarrage.
        if (!giveaway.drawnAt) await Giveaway.updateOne({ _id: giveaway._id }, { winnerIds: winners, participants, drawnAt: new Date() });

        const embed = giveawayEmbed(giveaway, participants.length, winners);

        await msg.edit({ embeds: [embed], allowedMentions: { parse: [] } });

        if (guild) {
            const logEmbed = new EmbedBuilder()
                .setColor(winners.length ? 0x57F287 : 0xED4245)
                .setTitle('🎉 Giveaway terminé')
                .setDescription([
                    `**Prix:** ${giveaway.prize}`,
                    `**Salon:** <#${giveaway.channelId}>`,
                    `**Participants:** ${participants.length}`,
                    winners.length ? `**Gagnants:** ${winners.map(w => `<@${w}>`).join(', ')}` : '**Gagnants:** Aucun',
                ].join('\n'))
                .setTimestamp();
            await LogDispatcher.giveaways(guild, logEmbed);
        }

        if (winners.length) {
            const settings = await getGuildSettings(client, giveaway.guildId, { create: false });
            let winMsg = settings?.giveaway?.winMessage || '🎉 Bravo {winners} ! Vous gagnez **{prize}**';
            
            winMsg = winMsg
                .replace(/{winners}/g, winners.map(w => `<@${w}>`).join(', '))
                .replace(/{prize}/g, giveaway.prize);

            await channel.send({ content: winMsg, allowedMentions: { parse: [], users: winners } });
        }
        await Giveaway.updateOne({ _id: giveaway._id }, { ended: true, active: false, endedAt: new Date() });
    },

    /**
     * Traiter les giveaways expirés
     */
    async processEnded(client) {
        const now = new Date();
        const all = await Giveaway.find({ ended: false });
        const ended = all.filter(g => g.endsAt <= now);

        for (const giveaway of ended) {
            await this.end(client, giveaway).catch(err => Logger.error('Erreur fin giveaway:', err));
        }
    },

    /**
     * Reroll un giveaway
     */
    async reroll(client, giveaway) {
        const channel = client.channels.cache.get(giveaway.channelId)
            || await client.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel) return null;

        const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (!msg) return null;

        const reaction = findReaction(msg, 'GIVEAWAY');
        if (!reaction) return null;

        const participants = await participantsFrom(reaction);

        const guild = client.guilds.cache.get(giveaway.guildId);
        // Un reroll doit désigner de nouveaux gagnants (sauf s'il n'y a personne d'autre).
        const previous = new Set(giveaway.winnerIds || []);
        const others = participants.filter(id => !previous.has(id));
        const winners = await this.pickWinners(client, giveaway, others.length ? others : participants, guild);
        if (winners.length) await Giveaway.updateOne({ _id: giveaway._id }, { winnerIds: [...previous, ...winners] });

        if (winners.length) {
            const settings = await getGuildSettings(client, giveaway.guildId, { create: false });
            let winMsg = settings?.giveaway?.winMessage || '🎉 Bravo {winners} ! Vous gagnez **{prize}**';
            
            winMsg = winMsg
                .replace(/{winners}/g, winners.map(w => `<@${w}>`).join(', '))
                .replace(/{prize}/g, giveaway.prize);

            await channel.send({ content: `**Nouveau tirage :** ${winMsg}`, allowedMentions: { parse: [], users: winners } });
        }

        if (guild) {
            const logEmbed = new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle('🎉 Giveaway reroll')
                .setDescription([
                    `**Prix:** ${giveaway.prize}`,
                    `**Salon:** <#${giveaway.channelId}>`,
                    winners.length ? `**Nouveaux gagnants:** ${winners.map(w => `<@${w}>`).join(', ')}` : '**Nouveaux gagnants:** Aucun',
                ].join('\n'))
                .setTimestamp();
            await LogDispatcher.giveaways(guild, logEmbed);
        }

        return winners;
    },

    async toggleParticipation(client, interaction, messageId) {
        const giveaway = await Giveaway.findOne({ messageId, guildId: interaction.guildId });
        if (!giveaway) {
            return interaction.reply({ content: '❌ Giveaway introuvable ou expiré.', flags: 64 });
        }

        if (giveaway.ended) {
            return interaction.reply({ content: '❌ Ce giveaway est déjà terminé.', flags: 64 });
        }

        return interaction.reply({
            content: `🎉 Pour participer à ce giveaway, ajoute la réaction ${getEmoji('GIVEAWAY')} sur le message du giveaway.`,
            flags: 64,
        });
    },

    async scheduleRefresh(client, message) {
        if (!message?.guildId || refreshTimers.has(message.id)) return;
        const giveaway = await Giveaway.findOne({ messageId: message.id, guildId: message.guildId, ended: false });
        if (!giveaway || giveaway.drawnAt || refreshTimers.has(message.id)) return;
        // Au plus un rafraîchissement par message toutes les dix secondes.
        const timer = setTimeout(async () => {
            try {
                await withKey(`giveaway:${giveaway._id}`, async () => {
                    const current = await Giveaway.findOne({ _id: giveaway._id });
                    if (!current || current.ended || current.drawnAt || new Date(current.endsAt) <= new Date()) return;
                    const channel = client.channels.cache.get(current.channelId) || await client.channels.fetch(current.channelId);
                    const msg = await channel.messages.fetch(current.messageId);
                    const participants = await participantsFrom(findReaction(msg, 'GIVEAWAY'));
                    await msg.edit({ embeds: [giveawayEmbed(current, participants.length)], allowedMentions: { parse: [] } });
                });
            } catch (error) {
                Logger.error('[Giveaway compteur]', error.message);
            } finally {
                refreshTimers.delete(message.id);
            }
        }, 10_000);
        timer.unref?.();
        refreshTimers.set(message.id, timer);
    },
};

module.exports = GiveawayService;
