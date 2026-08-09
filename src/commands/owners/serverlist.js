'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const PermissionsHelper = require('../../utils/permissions');

module.exports = {
    name: 'serverlist',
    category: 'owners',
    ownerOnly: true,
    description: 'Affiche la liste des serveurs où se trouve le bot',
    async run(client, message) {
        if (!PermissionsHelper.isBotOwner(client, message.author.id)) return;

        const guilds = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);

        if (!guilds.length) {
            return message.channel.send({ embeds: [EmbedHelper.info('🌐 Serverlist', 'Le bot n\'est sur aucun serveur.', { color: 0xFF0000 })] });
        }

        const PER_PAGE = 20;
        const pages = [];
        for (let i = 0; i < guilds.length; i += PER_PAGE) {
            const chunk = guilds.slice(i, i + PER_PAGE);
            pages.push(
                chunk.map((g, idx) =>
                    `\`${i + idx + 1}.\` **${g.name}** — \`${g.id}\` — ${g.memberCount} membres`
                ).join('\n')
            );
        }

        let page = 0;

        const buildEmbed = (p) => EmbedHelper.info(
            `🌐 Serveurs du Bot (${guilds.length} total)`,
            pages[p],
            { color: 0xFF0000, footer: `Page ${p + 1}/${pages.length}` }
        );

        const msg = await message.channel.send({ embeds: [buildEmbed(0)] });

        if (pages.length === 1) return;

        await msg.react('◀️');
        await msg.react('▶️');

        const collector = msg.createReactionCollector({
            filter: (r, u) => ['◀️', '▶️'].includes(r.emoji.name) && u.id === message.author.id,
            time: 120_000,
        });

        collector.on('collect', async (reaction, user) => {
            reaction.users.remove(user.id).catch(() => {});
            if (reaction.emoji.name === '◀️' && page > 0) page--;
            else if (reaction.emoji.name === '▶️' && page < pages.length - 1) page++;
            await msg.edit({ embeds: [buildEmbed(page)] });
        });

        collector.on('end', () => {
            msg.reactions.removeAll().catch(() => {});
        });
    },
};
