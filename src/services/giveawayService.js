'use strict';

const { EmbedBuilder } = require('discord.js');
const Giveaway = require('../models/Giveaway');
const Logger = require('../utils/logger');
const Helpers = require('../utils/helpers');
const LogDispatcher = require('../utils/logDispatcher');
const { getGuildSettings } = require('../utils/guildSettings');

const GiveawayService = {
    /**
     * Créer un giveaway
     */
    async create(client, channel, options) {
        const { prize, duration, hostId, requirements, guildId } = options;
        const endsAt = new Date(Date.now() + duration);

        const embed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setTitle(`🎉 GIVEAWAY — ${prize}`)
            .setDescription([
                `**Prix:** ${prize}`,
                `**Fin:** ${Helpers.discordTimestamp(endsAt, 'R')} (${Helpers.discordTimestamp(endsAt, 'f')})`,
                `**Organisé par:** <@${hostId}>`,
                requirements?.role ? `**Rôle requis:** <@&${requirements.role}>` : '',
                '',
                '**Réagissez avec 🎉 pour participer !**',
            ].filter(Boolean).join('\n'))
            .setTimestamp(endsAt)
            .setFooter({ text: 'Se termine' });

        const msg = await channel.send({ embeds: [embed] });
        await msg.react('🎉');

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

        return eligible.sort(() => Math.random() - 0.5).slice(0, giveaway.winners || 1);
    },

    /**
     * Terminer un giveaway
     */
    async end(client, giveaway) {
        if (giveaway.ended) return;

        // Verrou atomique : seule une exécution marque réellement le giveaway comme terminé,
        // ce qui évite le double tirage de gagnants en cas d'appels concurrents.
        const marked = await Giveaway.updateOne(
            { _id: giveaway._id, ended: false },
            { ended: true, active: false }
        );
        if (marked.modifiedCount === 0) return;

        const channel = client.channels.cache.get(giveaway.channelId)
            || await client.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel) return;

        const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (!msg) return;

        const reaction = msg.reactions.cache.get('🎉');
        if (!reaction) return;

        const users = await reaction.users.fetch();
        const participants = users.filter(u => !u.bot).map(u => u.id);

        const guild = client.guilds.cache.get(giveaway.guildId);
        const winners = await this.pickWinners(client, giveaway, participants, guild);

        await Giveaway.updateOne({ _id: giveaway._id }, { winnerIds: winners, participants, endedAt: new Date() });

        const embed = new EmbedBuilder()
            .setColor(winners.length ? 0x2B2D31 : 0xFF4444)
            .setTitle(`🎉 GIVEAWAY TERMINÉ — ${giveaway.prize}`)
            .setDescription(
                winners.length
                    ? `**Gagnants:** ${winners.map(w => `<@${w}>`).join(', ')}\n**Prix:** ${giveaway.prize}`
                    : '😢 Aucun participant éligible.'
            )
            .setTimestamp();

        await msg.edit({ embeds: [embed] }).catch(() => {});

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

            await channel.send({ content: winMsg }).catch(() => {});
        }
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

        const reaction = msg.reactions.cache.get('🎉');
        if (!reaction) return null;

        const users = await reaction.users.fetch();
        const participants = users.filter(u => !u.bot).map(u => u.id);

        const guild = client.guilds.cache.get(giveaway.guildId);
        const winners = await this.pickWinners(client, giveaway, participants, guild);

        if (winners.length) {
            const settings = await getGuildSettings(client, giveaway.guildId, { create: false });
            let winMsg = settings?.giveaway?.winMessage || '🎉 Bravo {winners} ! Vous gagnez **{prize}**';
            
            winMsg = winMsg
                .replace(/{winners}/g, winners.map(w => `<@${w}>`).join(', '))
                .replace(/{prize}/g, giveaway.prize);

            await channel.send({ content: `**Reroll:** ${winMsg}` }).catch(() => {});
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
            return interaction.reply({ content: '❌ Giveaway introuvable ou expiré.', ephemeral: true });
        }

        if (giveaway.ended) {
            return interaction.reply({ content: '❌ Ce giveaway est déjà terminé.', ephemeral: true });
        }

        return interaction.reply({
            content: '🎉 Pour participer à ce giveaway, ajoute une réaction 🎉 sur le message du giveaway.',
            ephemeral: true,
        });
    },
};

module.exports = GiveawayService;
