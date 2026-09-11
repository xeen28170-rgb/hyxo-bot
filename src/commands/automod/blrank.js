'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'blrank',
    category: 'automod',
    description: 'Gérer la blacklist rank',
    usage: '<on/off/max | danger/all | add/del <membre>>',
    permissions: ['Administrator'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id);

        if (sub === 'add') {
            const target = await Helpers.resolveMember(message.guild, args[1]);
            if (!target) return message.channel.send({ embeds: [EmbedHelper.error('Membre introuvable.')] });
            await Guild.updateOne({ guildId: message.guild.id }, { $addToSet: { 'antiraid.blrankList': target.id } });
            return message.channel.send({ embeds: [EmbedHelper.success(`<@${target.id}> ajouté à la blacklist rank.`)] });
        }

        if (sub === 'del' || sub === 'remove') {
            const target = await Helpers.resolveMember(message.guild, args[1]);
            if (!target) return message.channel.send({ embeds: [EmbedHelper.error('Membre introuvable.')] });
            await Guild.updateOne({ guildId: message.guild.id }, { $pull: { 'antiraid.blrankList': target.id } });
            return message.channel.send({ embeds: [EmbedHelper.success(`<@${target.id}> retiré de la blacklist rank.`)] });
        }

        if (sub === 'danger' || sub === 'all') {
            await Guild.updateOne({ guildId: message.guild.id }, { 'antiraid.blrankType': sub });
            return message.channel.send({ embeds: [EmbedHelper.success(`Blacklist Rank réglée sur les rôles **${sub === 'danger' ? 'dangereux' : 'tous'}**.`)] });
        }

        if (sub === 'on' || sub === 'off' || sub === 'max') {
            await Guild.updateOne({ guildId: message.guild.id }, { 'antiraid.blrank': sub });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Blacklist Rank est désormais réglée sur **${sub}**.`)] });
        }

        const ar = settings.antiraid;
        const embed = EmbedHelper.info('🛡️ Blacklist Rank', [
            `État actuel: **${ar.blrank}**`,
            `Type: **${ar.blrankType}**`,
            `Membres listés: **${ar.blrankList.length}**`,
            '',
            '**Usage:**',
            '`-blrank on/off/max`',
            '`-blrank danger/all`',
            '`-blrank add @membre`',
            '`-blrank del @membre`'
        ].join('\n'), { color: 0xFF0000 });

        return message.channel.send({ embeds: [embed] });
    },
};
