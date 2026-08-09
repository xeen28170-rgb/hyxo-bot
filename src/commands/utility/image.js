'use strict';

const axios = require('axios');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'image',
    category: 'utility',
    description: 'Fait une recherche google image avec le bot',
    usage: '<mot-clé>',
    async run(client, message, args) {
        const query = args.join(' ');
        if (!query) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir un mot-clé.')] });

        try {
            const { data } = await axios.get('https://www.googleapis.com/customsearch/v1', {
                params: {
                    key: process.env.GOOGLE_API_KEY,
                    cx: process.env.GOOGLE_CX,
                    q: query,
                    searchType: 'image',
                    num: 5,
                    safe: 'active',
                },
                timeout: 8000,
            });

            if (!data?.items?.length) {
                return message.channel.send({ embeds: [EmbedHelper.error('Aucun résultat trouvé.')] });
            }

            const embed = EmbedHelper.info(`🔍 Résultats pour "${query}"`, data.items.map((item, i) =>
                `[${i + 1}. ${item.title}](${item.image?.contextLink || item.link})`
            ).join('\n'), { color: 0x5865F2, thumbnail: data.items[0].link });

            await message.channel.send({ embeds: [embed] });
        } catch {
            const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch`;
            const embed = EmbedHelper.info(`🔍 Recherche Image: ${query}`, `[Cliquez ici pour voir les images](${url})\n\nPour une intégration directe, configurez \`GOOGLE_API_KEY\` et \`GOOGLE_CX\` dans le fichier \`.env\`.`, { color: 0xFF0000 });
            await message.channel.send({ embeds: [embed] });
        }
    },
};
