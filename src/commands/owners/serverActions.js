'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const PermissionsHelper = require('../../utils/permissions');

module.exports = {
    name: 'server-action',
    category: 'owners',
    ownerOnly: true,
    description: 'Interagir avec un serveur où se trouve le bot',
    usage: '<invite|leave|discussion> <ID serveur>',
    async run(client, message, args) {
        if (!PermissionsHelper.isBotOwner(client, message.author.id)) return;

        const sub = args[0]?.toLowerCase();
        const targetId = args[1];

        const validSubs = ['invite', 'leave', 'discussion'];

        if (!sub || !validSubs.includes(sub) || !targetId) {
            return message.channel.send({
                embeds: [EmbedHelper.info(
                    '📋 server-action — Aide',
                    [
                        '`+server-action invite <ID>` — Génère une invitation permanente vers ce serveur',
                        '`+server-action leave <ID>` — Fait quitter le bot du serveur',
                        '`+server-action discussion <ID>` — Relaie tes messages dans un salon du serveur',
                    ].join('\n'),
                    { color: 0xFF0000 }
                )],
            });
        }

        const guild = client.guilds.cache.get(targetId);
        if (!guild) {
            return message.channel.send({
                embeds: [EmbedHelper.error(`Le bot n'est pas sur le serveur \`${targetId}\`.`)],
            });
        }

        if (sub === 'invite') {
            const channel = guild.channels.cache.find(
                c => c.type === 0 && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite')
            );
            if (!channel) {
                return message.channel.send({
                    embeds: [EmbedHelper.error(`Impossible de créer une invitation sur **${guild.name}** (permissions insuffisantes).`)],
                });
            }
            const invite = await channel.createInvite({ maxAge: 0, maxUses: 1, unique: true });
            return message.channel.send({
                embeds: [EmbedHelper.info(
                    '🔗 Invitation générée',
                    `**Serveur :** ${guild.name} (\`${guild.id}\`)\n**Membres :** ${guild.memberCount}\n**Lien :** ${invite.url}`,
                    { color: 0x57F287 }
                )],
            });
        }

        if (sub === 'leave') {
            const name = guild.name;
            const id = guild.id;
            await guild.leave();
            return message.channel.send({
                embeds: [EmbedHelper.success(`Le bot a quitté **${name}** (\`${id}\`).`)],
            });
        }

        if (sub === 'discussion') {
            const channel = guild.channels.cache.find(
                c => c.type === 0 && c.permissionsFor(guild.members.me)?.has('SendMessages')
            );
            if (!channel) {
                return message.channel.send({
                    embeds: [EmbedHelper.error(`Impossible d'envoyer des messages sur **${guild.name}** (permissions insuffisantes).`)],
                });
            }

            await message.channel.send({
                embeds: [EmbedHelper.info(
                    '💬 Mode Discussion',
                    `Tes prochains messages seront relayés dans **${guild.name}** → <#${channel.id}>.\nTape \`exit\` pour arrêter (timeout : 5 min).`,
                    { color: 0xFF0000 }
                )],
            });

            const collector = message.channel.createMessageCollector({
                filter: m => m.author.id === message.author.id,
                time: 300_000,
            });

            collector.on('collect', async m => {
                if (m.content.toLowerCase() === 'exit') {
                    collector.stop('exit');
                    return;
                }
                try {
                    await channel.send(`**[Bot Owner]** ${m.content}`);
                    await m.react('✅').catch(() => {});
                } catch {
                    await m.react('❌').catch(() => {});
                }
            });

            collector.on('end', (_, reason) => {
                const txt = reason === 'exit'
                    ? '💬 Discussion terminée.'
                    : '💬 Discussion terminée (timeout 5 min).';
                message.channel.send({ embeds: [EmbedHelper.warning(txt)] });
            });
        }
    },
};
