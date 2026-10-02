'use strict';

const { EmbedBuilder } = require('discord.js');
const Helpers = require('../../utils/helpers');
const Sanction = require('../../models/Sanction');
const { getEmoji } = require('../../config/emojis');

const MAX_ROLES = 3;
const HEAVY = new Set(['ban', 'tempban', 'kick', 'mute', 'tempmute']);

async function casier(guildId, userId) {
    const sanctions = await Sanction.find({ guildId, userId }).catch(() => []);
    const warns = sanctions.filter(s => s.type === 'warn' && s.active).length;
    const heavy = sanctions.filter(s => HEAVY.has(s.type)).length;
    const parts = [];
    if (warns) parts.push(`${warns} avertissement${warns > 1 ? 's' : ''}`);
    if (heavy) parts.push(`${heavy} sanction${heavy > 1 ? 's' : ''}`);
    return parts.length ? `${getEmoji('WARN')} ${parts.join(', ')}` : 'aucune sanction';
}

module.exports = {
    name: 'user',
    category: 'utility',
    description: 'Affiche les informations relatives à un utilisateur',
    usage: '[membre]',
    async run(client, message, args) {
        const user = await Helpers.resolveUser(client, args[0], message.guild) || message.author;
        const member = message.guild.members.cache.get(user.id);

        const dates = [`Compte créé ${Helpers.discordTimestamp(user.createdAt, 'R')}`];
        if (member) dates.push(`arrivé ${Helpers.discordTimestamp(member.joinedAt, 'R')}`);

        const roles = member ? [...member.roles.cache.values()]
            .filter(role => role.id !== message.guild.id)
            .sort((a, b) => b.position - a.position) : [];
        const shown = roles.slice(0, MAX_ROLES).map(role => `**${role.name}**`).join(', ');
        const more = roles.length > MAX_ROLES ? ` +${roles.length - MAX_ROLES}` : '';
        const second = [roles.length ? shown + more : (member ? 'aucun rôle' : 'pas sur le serveur')];
        if (member) second.push(await casier(message.guild.id, user.id));

        const embed = new EmbedBuilder()
            .setColor(0x22D3EE)
            .setAuthor({ name: `${user.bot ? 'Bot' : 'Profil'} · ID ${user.id}` })
            .setTitle(member?.displayName && member.displayName !== user.username ? `${member.displayName} (${user.username})` : user.username)
            .setDescription([dates.join(' · '), second.join(' · ')].join('\n'))
            .setThumbnail(user.displayAvatarURL({ size: 256 }));

        message.channel.send({ embeds: [embed] });
    },
};
