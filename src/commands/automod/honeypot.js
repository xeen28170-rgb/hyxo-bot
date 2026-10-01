'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');
const { PUNISHMENTS } = require('../../services/honeypotService');

const CHANNEL_NAME = '🍯・ne-pas-écrire';
const PUNISHMENT_LABELS = {
    softban: 'Softban (expulsé + 24 h de messages supprimés)',
    ban: 'Ban (+ 24 h de messages supprimés)',
    kick: 'Kick',
    timeout: 'Exclusion temporaire de 24 h',
};

function warningEmbed() {
    return EmbedHelper.warning([
        '**🚫 N\'écris rien dans ce salon.**',
        '',
        'Ce salon est un piège à bots : tout message posté ici entraîne une **sanction automatique**.',
        'Les bots de spam et les comptes piratés écrivent partout, ce salon permet de les arrêter avant qu\'ils ne touchent le reste du serveur.',
    ].join('\n'));
}

async function save(client, guildId, values) {
    const update = Object.fromEntries(Object.entries(values).map(([key, value]) => [`honeypot.${key}`, value]));
    await Guild.updateOne({ guildId }, update);
    client.cache.invalidateGuild(guildId);
}

function statusEmbed(honeypot, prefix) {
    const state = honeypot?.enabled && honeypot.channelId ? `✅ Activé dans <#${honeypot.channelId}>` : '❌ Désactivé';
    return EmbedHelper.info('🍯 Honeypot', [
        `**État :** ${state}`,
        `**Sanction :** ${PUNISHMENT_LABELS[honeypot?.punishment] || PUNISHMENT_LABELS.softban}`,
        '',
        `\`${prefix}honeypot create\` — créer le salon piège`,
        `\`${prefix}honeypot set #salon\` — utiliser un salon existant`,
        `\`${prefix}honeypot sanction <${PUNISHMENTS.join('|')}>\` — changer la sanction`,
        `\`${prefix}honeypot off\` — désactiver`,
        '',
        'Le staff (permission Gérer les messages), les owners et la whitelist ne sont jamais sanctionnés.',
    ].join('\n'));
}

module.exports = {
    name: 'honeypot',
    aliases: ['piege', 'piège'],
    category: 'automod',
    description: 'Salon piège qui sanctionne automatiquement les bots de spam et comptes piratés.',
    usage: '-honeypot [create | set #salon | sanction <type> | off]',
    permissions: ['Administrator'],
    botPermissions: ['ManageChannels', 'BanMembers', 'KickMembers', 'ModerateMembers', 'ManageMessages'],
    async run(client, message, args) {
        const guild = message.guild;
        const settings = await getGuildSettings(client, guild.id);
        const prefix = settings.prefix || client.prefix;
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'create') {
            const channel = await guild.channels.create({
                name: CHANNEL_NAME,
                type: ChannelType.GuildText,
                position: 0,
                topic: 'Salon piège : n\'écris rien ici, tout message est sanctionné automatiquement.',
                permissionOverwrites: [
                    { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], deny: [PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreatePublicThreads] },
                ],
                reason: `Honeypot créé par ${message.author.tag}`,
            });
            await channel.send({ embeds: [warningEmbed()] });
            await save(client, guild.id, { enabled: true, channelId: channel.id });
            return message.channel.send({ embeds: [EmbedHelper.success(`Salon piège créé : ${channel}. Toute personne qui y écrit sera sanctionnée.`)] });
        }

        if (sub === 'set') {
            const channel = Helpers.resolveChannel(guild, args[1]);
            if (!channel || channel.type !== ChannelType.GuildText) {
                return message.channel.send({ embeds: [EmbedHelper.error(`Mentionne un salon textuel : \`${prefix}honeypot set #salon\``)] });
            }
            await channel.send({ embeds: [warningEmbed()] }).catch(() => {});
            await save(client, guild.id, { enabled: true, channelId: channel.id });
            return message.channel.send({ embeds: [EmbedHelper.success(`${channel} est maintenant le salon piège.`)] });
        }

        if (sub === 'sanction' || sub === 'punish') {
            const punishment = (args[1] || '').toLowerCase();
            if (!PUNISHMENTS.includes(punishment)) {
                return message.channel.send({ embeds: [EmbedHelper.error(`Sanctions possibles : ${PUNISHMENTS.map(p => `\`${p}\``).join(', ')}.`)] });
            }
            await save(client, guild.id, { punishment });
            return message.channel.send({ embeds: [EmbedHelper.success(`Sanction du honeypot : **${PUNISHMENT_LABELS[punishment]}**.`)] });
        }

        if (sub === 'off') {
            await save(client, guild.id, { enabled: false });
            return message.channel.send({ embeds: [EmbedHelper.success('Honeypot désactivé. Le salon n\'est pas supprimé, tu peux le retirer toi-même.')] });
        }

        return message.channel.send({ embeds: [statusEmbed(settings.honeypot, prefix)] });
    },
};
