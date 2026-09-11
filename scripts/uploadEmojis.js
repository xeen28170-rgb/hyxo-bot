'use strict';

/**
 * Upload les images de assets/emojis/ comme "Application Emojis" Discord
 * (emojis propres au bot, utilisables sur tous les serveurs) et met à
 * jour automatiquement src/config/emojis.js avec les IDs obtenus.
 *
 * Usage : node scripts/uploadEmojis.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

const EMOJI_DIR = path.join(__dirname, '..', 'assets', 'emojis');
const CONFIG_PATH = path.join(__dirname, '..', 'src', 'config', 'emojis.js');
const VALID_EXT = /\.(png|jpe?g|gif|webp)$/i;

async function main() {
    if (!process.env.TOKEN?.trim()) {
        console.error('❌ TOKEN manquant dans .env');
        process.exit(1);
    }

    if (!fs.existsSync(EMOJI_DIR)) {
        console.error(`❌ Dossier introuvable : ${EMOJI_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(EMOJI_DIR).filter(f => VALID_EXT.test(f));
    if (!files.length) {
        console.error(`❌ Aucune image trouvée dans ${EMOJI_DIR}`);
        console.error('   Ajoute des fichiers nommés comme les clés de src/config/emojis.js (ex: ban.png).');
        process.exit(1);
    }

    console.log(`→ Connexion au bot...`);
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(process.env.TOKEN);
    await new Promise(resolve => client.once('ready', resolve));
    console.log(`→ Connecté en tant que ${client.user.tag}\n`);

    const existing = await client.application.emojis.fetch();
    const results = {};

    for (const file of files) {
        const key = path.basename(file, path.extname(file)).toUpperCase();
        const name = key.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32);

        const already = existing.find(e => e.name === name);
        if (already) {
            console.log(`↷ ${key} — déjà présent, réutilisation de <${already.animated ? 'a' : ''}:${already.name}:${already.id}>`);
            results[key] = already.toString();
            continue;
        }

        try {
            const emoji = await client.application.emojis.create({
                attachment: path.join(EMOJI_DIR, file),
                name,
            });
            console.log(`✔ ${key} → ${emoji.toString()}`);
            results[key] = emoji.toString();
        } catch (err) {
            console.error(`✘ ${key} — échec de l'upload : ${err.message}`);
        }
    }

    let content = fs.readFileSync(CONFIG_PATH, 'utf8');
    let updated = 0;
    for (const [key, value] of Object.entries(results)) {
        const regex = new RegExp(`\\b${key}:\\s*null,`);
        if (regex.test(content)) {
            content = content.replace(regex, `${key}: '${value}',`);
            updated++;
        } else {
            console.warn(`⚠ Clé "${key}" absente (ou déjà remplie) dans emojis.js — vérifie manuellement.`);
        }
    }
    fs.writeFileSync(CONFIG_PATH, content, 'utf8');

    console.log(`\n${updated} clé(s) mise(s) à jour dans src/config/emojis.js.`);
    process.exit(0);
}

main().catch(err => {
    console.error('Erreur fatale :', err);
    process.exit(1);
});
