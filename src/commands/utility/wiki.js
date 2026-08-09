'use strict';

const axios = require('axios');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'wiki',
    category: 'utility',
    description: 'Fait une recherche wikipedia avec le bot',
    usage: '<mot-clé>',
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        const query = (sub === 'search' ? args.slice(1) : args).join(' ');

        if (!query) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir un mot-clé.')] });

        try {
            const { data } = await axios.get('https://fr.wikipedia.org/w/api.php', {
                params: {
                    action: 'query',
                    list: 'search',
                    srsearch: query,
                    format: 'json',
                    srlimit: 5,
                    origin: '*',
                },
                timeout: 8000,
            });

            const results = data?.query?.search;
            if (!results?.length) {
                return message.channel.send({ embeds: [EmbedHelper.error('Aucun résultat trouvé sur Wikipedia.')] });
            }

            const embed = EmbedHelper.info(`📖 Résultats Wikipedia pour "${query}"`, results.map(r =>
                `[${r.title}](https://fr.wikipedia.org/wiki/${encodeURIComponent(r.title)}) — ${r.snippet.replace(/<\/?[^>]+(>|$)/g, '').slice(0, 150)}...`
            ).join('\n\n'), { color: 0x5865F2, footer: 'Source: Wikipedia' });

            await message.channel.send({ embeds: [embed] });
        } catch {
            const url = `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}`;
            const embed = EmbedHelper.info(`📖 Wikipedia: ${query}`, `[Cliquez ici pour voir](${url})`, { color: 0xFF0000 });
            await message.channel.send({ embeds: [embed] });
        }
    },
};
