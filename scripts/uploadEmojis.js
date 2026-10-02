'use strict';

/**
 * Upload des images de `assets/emojis/` comme **Application Emojis** Discord
 * (propres au bot, utilisables sur tous ses serveurs), puis écriture des IDs
 * générés dans `src/config/emojis.js`.
 *
 *   node scripts/uploadEmojis.js --dry-run   # simulate, ne modifie rien
 *   node scripts/uploadEmojis.js             # upload + patch emojis.js
 *
 * Idempotent : un emoji portant le même nom est réutilisé, jamais dupliqué.
 * Requiert `TOKEN` dans `.env`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');
const { NOTO: MANIFEST } = require('./notoEmojis');

// Préfixe « hx_ » : le pack animé Hyxo ne réutilise pas les anciens emojis fixes « x_ ».
const emojiName = (key) => `hx_${key.toLowerCase()}`;
const fileName = (key) => `${key.toLowerCase()}.gif`;

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets', 'emojis');
const EMOJIS_FILE = path.join(ROOT, 'src', 'config', 'emojis.js');
const DRY = process.argv.includes('--dry-run');

// ── .env minimal ──────────────────────────────────────────────────
(function loadEnv() {
    const file = path.join(ROOT, '.env');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
})();

const identifier = (e) => `${e.animated ? '<a:' : '<:'}${e.name}:${e.id}>`;

/** Remplace `KEY: null` par `KEY: '<:name:id>'` dans le bloc EMOJIS. */
function patchEmojisFile(ids) {
    const start = src.indexOf('const EMOJIS = {');
    const end = src.indexOf('};', start);
    if (start === -1 || end === -1) throw new Error('Bloc EMOJIS introuvable dans emojis.js');

    let head = src.slice(0, start);
    let block = src.slice(start, end + 2);
    const tail = src.slice(end + 2);

    let patched = 0;
    for (const [key, value] of Object.entries(ids)) {
        const re = new RegExp(`(\\b${key}:\\s*)(?:null\\b|'[^']*')`);
        if (re.test(block)) {
            block = block.replace(re, `$1'${value}'`);
            patched++;
        }
    }
    fs.writeFileSync(EMOJIS_FILE, head + block + tail, 'utf8');
    return patched;
}

let src = fs.readFileSync(EMOJIS_FILE, 'utf8');

(async () => {
    const token = (process.env.TOKEN || '').trim();
    if (!token) {
        console.error('✖ TOKEN manquant dans .env');
        process.exit(1);
    }

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    client.once('clientReady', async () => {
        try {
            const keys = Object.keys(MANIFEST);
            const files = keys.filter((k) => fs.existsSync(path.join(ASSETS, fileName(k))));
            const missing = keys.filter((k) => !files.includes(k));

            console.log(`Application : ${client.user.tag}`);
            console.log(`Images à traiter : ${files.length}/${keys.length}${missing.length ? ` — absentes: ${missing.join(', ')}` : ''}\n`);
            if (DRY) console.log('Mode simulation (--dry-run) : rien ne sera modifié.\n');

            const existing = await client.application.emojis.fetch();
            const byName = new Map();
            for (const [, e] of existing) byName.set(e.name, e);

            console.log(`Emojis d'application déjà présents : ${existing.size}`);

            const ids = {};
            let created = 0;
            for (const key of files) {
                const name = emojiName(key);
                let emoji = byName.get(name);

                if (emoji) {
                    console.log(`  = ${key.padEnd(18)} réutilisé ${identifier(emoji)}`);
                } else if (DRY) {
                    console.log(`  + ${key.padEnd(18)} serait créé (nom: ${name})`);
                    continue;
                } else {
                    emoji = await client.application.emojis.create({
                        attachment: path.join(ASSETS, fileName(key)),
                        name,
                    });
                    byName.set(name, emoji);
                    created++;
                    console.log(`  ✔ ${key.padEnd(18)} créé ${identifier(emoji)}`);
                }
                ids[key] = identifier(emoji);
            }

            if (!DRY && Object.keys(ids).length) {
                const patched = patchEmojisFile(ids);
                console.log(`\nsrc/config/emojis.js mis à jour : ${patched} clé(s) écrite(s).`);
            }

            console.log(`\n${created} emoji(s) créé(s).`);
            process.exit(0);
        } catch (err) {
            console.error('✖ Échec :', err.message);
            process.exit(1);
        }
    });

    await client.login(token);
})();
