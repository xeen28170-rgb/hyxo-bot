'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'emoji',
    category: 'utility',
    description: 'Ajoute un ou plusieurs emojis custom au serveur',
    usage: '<emoji1> [emoji2] [emoji3] ...',
    permissions: ['ManageEmojisAndStickers'],
    async run(client, message, args) {
        if (!args.length) {
            return message.channel.send({
                embeds: [EmbedHelper.error('Veuillez fournir un ou plusieurs emojis custom (ex: `<:nom:id>`).')],
            });
        }

        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
            return message.channel.send({
                embeds: [EmbedHelper.error('Je n\'ai pas la permission de gérer les emojis sur ce serveur.')],
            });
        }

        const raw = args.join(' ');
        const matches = [...raw.matchAll(/<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>/g)];
        if (!matches.length) {
            return message.channel.send({
                embeds: [EmbedHelper.error('Aucun emoji custom valide détecté. Format attendu: `<:nom:id>` ou `<a:nom:id>`.')],
            });
        }

        const seen = new Set();
        const parsed = [];
        for (const m of matches) {
            const isAnimated = m[1] === 'a';
            const name = m[2];
            const id = m[3];
            if (seen.has(id)) continue;
            seen.add(id);
            parsed.push({
                id,
                name,
                url: `https://cdn.discordapp.com/emojis/${id}.${isAnimated ? 'gif' : 'png'}`,
            });
        }

        const added = [];
        const failed = [];

        for (const e of parsed) {
            try {
                const created = await message.guild.emojis.create({
                    attachment: e.url,
                    name: e.name,
                    reason: `Ajout via +emoji par ${message.author.tag}`,
                });
                added.push(`${created} (\`${created.name}\`)`);
            } catch (err) {
                failed.push(`\`${e.name}\` (\`${e.id}\`) — ${err.message}`);
            }
        }

        const lines = [];
        lines.push(`Demandés: \`${parsed.length}\``);
        lines.push(`Ajoutés: \`${added.length}\``);
        lines.push(`Échecs: \`${failed.length}\``);
        if (added.length) lines.push(`\n✅ ${added.join(' | ')}`);
        if (failed.length) lines.push(`\n❌ ${failed.slice(0, 8).join('\n')}`);

        const embed = EmbedHelper.info('😀 Import d\'emojis', lines.join('\n'), { color: failed.length ? 0xF39C12 : 0x57F287 });
        return message.channel.send({ embeds: [embed] });
    },
};
