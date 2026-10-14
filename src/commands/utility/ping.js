'use strict';

const { EmbedBuilder } = require('discord.js');
const EmbedHelper = require('../../utils/embedBuilder');
const PerfMonitor = require('../../utils/performanceMonitor');

function verdict(ms) {
    if (ms < 250) return { label: 'excellent', color: 0x3BD47E };
    if (ms < 700) return { label: 'correct', color: 0xFFD43B };
    return { label: 'lent', color: 0xFF2D4B };
}

module.exports = {
    name: 'ping',
    category: 'utility',
    description: 'Voir la latence du bot et ce qui le ralentit.',
    usage: '-ping',
    cooldown: 5,
    async run(client, message) {
        // Attente avant traitement : du message envoyé sur Discord à son arrivée dans le bot.
        const received = Math.max(0, Date.now() - message.createdTimestamp);
        const start = Date.now();
        const msg = await message.channel.send({ embeds: [EmbedHelper.info('Latence', 'Mesure en cours…')] });
        const api = Date.now() - start;
        const ws = client.ws.ping;
        const perf = PerfMonitor.stats();
        const { label, color } = verdict(api);

        // Ce qui ralentit le plus, en clair.
        const causes = [];
        if (perf.loopMax >= 1000) {
            causes.push(perf.cpuPercent < 40
                ? `Le bot a été bloqué jusqu'à **${perf.loopMax} ms** alors qu'il n'utilise que ${perf.cpuPercent} % du processeur : l'hébergeur ne lui donne pas assez de ressources.`
                : `Le bot a été bloqué jusqu'à **${perf.loopMax} ms** et utilise ${perf.cpuPercent} % du processeur : un traitement lourd est en cours.`);
        }
        if (ws > 300) causes.push(`La connexion à Discord est lente (**${ws} ms**) : réseau de l'hébergeur ou souci chez Discord.`);
        if (api > 700 && ws <= 300) causes.push(`Discord met du temps à accepter les messages (**${api} ms**) : limites de Discord ou réseau.`);
        if (received > 2000) causes.push(`Les messages arrivent au bot avec **${received} ms** de retard (ou l'horloge du serveur est décalée).`);

        const embed = new EmbedBuilder()
            .setColor(causes.length ? 0xFF2D4B : color)
            .setAuthor({ name: 'Latence' })
            .setTitle(`${api} ms · ${label}`)
            .addFields(
                { name: 'Envoi d\'un message', value: `${api} ms`, inline: true },
                { name: 'Connexion Discord', value: ws < 0 ? 'en cours de mesure' : `${ws} ms`, inline: true },
                { name: 'Réception de ta commande', value: `${received} ms`, inline: true },
                { name: 'Blocage du bot (30 s)', value: `${perf.loopP99} ms en général · ${perf.loopMax} ms au pire`, inline: true },
                { name: 'Processeur', value: `${perf.cpuPercent} %`, inline: true },
                { name: 'Mémoire', value: `${perf.memoryMb} Mo`, inline: true },
                { name: 'Diagnostic', value: causes.length ? causes.join('\n') : 'Rien d\'anormal : le bot répond normalement.' },
            )
            .setFooter({ text: 'Démarré' })
            .setTimestamp(Date.now() - client.uptime);
        if (perf.slowCommands.length) {
            embed.addFields({
                name: 'Dernières commandes lentes',
                value: perf.slowCommands.slice(-5).map(c => `\`${c.name}\` · attente ${c.waited} ms · exécution ${c.ran} ms`).join('\n'),
            });
        }
        await msg.edit({ embeds: [embed] });
    },
};
