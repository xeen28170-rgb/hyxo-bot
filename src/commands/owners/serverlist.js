'use strict';

const { getEmoji, matchesReaction } = require('../../config/emojis');

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

        const getInviteUrl = async (guild) => {
            try {
                if (guild.members.me?.permissions.has('ManageGuild')) {
                    const existing = await guild.invites.fetch().catch(() => null);
                    const reusable = existing?.find(inv => inv.maxAge === 0);
                    if (reusable) return reusable.url;
                }
                const channel = guild.channels.cache.find(
                    c => c.type === 0 && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite')
                );
                if (!channel) return null;
                const invite = await channel.createInvite({ maxAge: 0, unique: false });
                return invite.url;
            } catch {
                return null;
            }
        };

        const lines = await Promise.all(guilds.map(async (g, idx) => {
            const url = await getInviteUrl(g);
            const label = url ? `[${g.name}](${url})` : g.name;
            return `\`${idx + 1}.\` **${label}** — \`${g.id}\` — ${g.memberCount} membres`;
        }));

        const PER_PAGE = 20;
        const pages = [];
        for (let i = 0; i < lines.length; i += PER_PAGE) {
            pages.push(lines.slice(i, i + PER_PAGE).join('\n'));
        }

        let page = 0;

        const buildEmbed = (p) => EmbedHelper.info(
            `🌐 Serveurs du Bot (${guilds.length} total)`,
            pages[p],
            { color: 0xFF0000, footer: `Page ${p + 1}/${pages.length}` }
        );

        const msg = await message.channel.send({ embeds: [buildEmbed(0)] });

        if (pages.length === 1) return;

        await msg.react(getEmoji('ARROW_LEFT'));
        await msg.react(getEmoji('ARROW_RIGHT'));

        const collector = msg.createReactionCollector({
            filter: (r, u) => (matchesReaction(r.emoji, 'ARROW_LEFT') || matchesReaction(r.emoji, 'ARROW_RIGHT')) && u.id === message.author.id,
            time: 120_000,
        });

        collector.on('collect', async (reaction, user) => {
            reaction.users.remove(user.id).catch(() => {});
            if (matchesReaction(reaction.emoji, 'ARROW_LEFT') && page > 0) page--;
            else if (matchesReaction(reaction.emoji, 'ARROW_RIGHT') && page < pages.length - 1) page++;
            await msg.edit({ embeds: [buildEmbed(page)] });
        });

        collector.on('end', () => {
            msg.reactions.removeAll().catch(() => {});
        });
    },
};
