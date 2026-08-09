'use strict';

const fs = require('fs-extra');
const path = require('path');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'mainprefix',
    category: 'owners',
    ownerOnly: true,
    description: 'Change le préfixe par défaut du bot',
    usage: '<nouveau_prefix>',
    async run(client, message, args) {
        const prefix = args[0];
        if (!prefix || prefix.length > 5) {
            return message.channel.send({ embeds: [EmbedHelper.error('Préfixe invalide. Maximum 5 caractères.')] });
        }

        client.prefix = prefix;

        const envPath = path.join(process.cwd(), '.env');
        try {
            let envContent = await fs.readFile(envPath, 'utf8');
            if (/^PREFIX=/m.test(envContent)) {
                envContent = envContent.replace(/^PREFIX=.*$/m, `PREFIX=${prefix}`);
            } else {
                envContent += `\nPREFIX=${prefix}`;
            }
            await fs.writeFile(envPath, envContent, 'utf8');
        } catch {
            // .env maybe not writable, still works in-memory
        }

        message.channel.send({ embeds: [EmbedHelper.success(`Préfixe par défaut changé en **${prefix}**.`)] });
    },
};
