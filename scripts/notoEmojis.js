'use strict';

/**
 * Pack d'emojis animés Hyxo : un emoji Google Noto Animated par clé du bot.
 * Licence des images : CC BY 4.0 (Google) — citer « Emojis : Google Noto ».
 *
 *   node scripts/notoEmojis.js            # télécharge + convertit en assets/emojis/<clé>.gif
 *   node scripts/notoEmojis.js --only=BAN,PING
 *
 * Chaque GIF est réduit à 128 px et compressé sous la limite Discord (256 Ko).
 * Nécessite `sharp` (npm i -D sharp). Ensuite : node scripts/uploadEmojis.js
 */

const fs = require('node:fs');
const path = require('node:path');

// clé du bot → code Noto (voir https://googlefonts.github.io/noto-emoji-animation/)
const NOTO = {
    // Réponses du bot
    SUCCESS: '2705', ERROR: '274c', WARNING: '26a0_fe0f', INFO: '1f4a1', LOADING: '23f3',
    // Modération
    BAN: '1f4a5', UNBAN: '1f54a_fe0f', KICK: '1f9b6', MUTE: '1f64a', UNMUTE: '1f5e3_fe0f',
    WARN: '2757', TIMEOUT: '23f0', LOCK: '1f512', UNLOCK: '26d3_fe0f_200d_1f4a5',
    HIDE: '1f648', UNHIDE: '1f441_fe0f', PRISON: '26d3_fe0f', UNPRISON: '1f64c',
    ROLE_ADD: '2795', ROLE_REMOVE: '1faf7', DERANK: '1f4c9', SANCTIONS: '2696_fe0f', LEASH: '1f415',
    // Protection
    SHIELD: '1f409', ROBOT: '1f916', ALERT: '1f6a8', BARRIER: '1f6a7', BLOCK: '1f6d1', BACKUP: '1f4bf',
    // Tickets & giveaways
    TICKET: '1f39f_fe0f', TICKET_CLOSE: '1f44b', TICKET_CLAIM: '270b', TICKET_TRANSCRIPT: '270d_fe0f',
    GIVEAWAY: '1f381', TROPHY: '1f3c6', GIVEAWAY_REROLL: '1f3b2',
    // Vocal
    VOICE: '1f442', VOICE_LOCK: '1f4f4',
    // Navigation & interface
    ARROW_LEFT: '1f448', ARROW_RIGHT: '1f449', HOME: '1f3e0', SEARCH: '1f50e', SETTINGS: '2699_fe0f',
    ON: '1f50b', OFF: '1faab', PLUS: '2795', MINUS: '1faf3', EDIT: '270f_fe0f', TRASH: '1f5d1_fe0f',
    // Serveur & membres
    CROWN: '1f451', OWNER: '1f9d0', USER: '1f642', MEMBERS: '1f91d', ROLE: '1f393', CHANNEL: '1f4fa',
    MESSAGE: '1f4ac', EMBED: '1fa84', LOGS: '1f4da', STATS: '1f4ca', FOLDER: '1f4e6', NOTE: '1f9e0',
    LINK: '1f587_fe0f', MAIL: '1f48c', INBOX: '1f6ce_fe0f', MEGAPHONE: '1f4e3', BELL: '1f514',
    // Divers
    PING: '1f3d3', CLOCK: '231b', CALENDAR: '1f305', STAR: '2b50', HEART: '2764_fe0f', FLAME: '1f525',
    BOLT: '26a1', SPARKLES: '2728', ROCKET: '1f680', GEM: '1f48e', GLOBE: '1f30d', CAMERA: '1f4f8',
    PALETTE: '1f308',
};

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'emojis');
const LIMIT = 256 * 1024;
const ONLY = process.argv.find(a => a.startsWith('--only='))?.split('=')[1].split(',').map(s => s.trim().toUpperCase());

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function convert(sharp, input) {
    // Du plus beau au plus léger, jusqu'à passer sous la limite Discord.
    for (const [size, colours] of [[128, 128], [128, 64], [112, 64]]) {
        const gif = await sharp(input, { animated: true }).resize(size, size, { fit: 'contain', background: TRANSPARENT })
            .gif({ colours, effort: 10, dither: 0.5 }).toBuffer();
        if (gif.length <= LIMIT) return { gif, size };
    }
    // Animations longues : on garde une image sur deux (ou trois), en allongeant leur durée.
    for (const [size, step] of [[112, 2], [96, 2], [96, 3], [80, 3]]) {
        const gif = await skipFrames(sharp, input, size, step);
        if (gif.length <= LIMIT) return { gif, size };
    }
    throw new Error('impossible de passer sous 256 Ko');
}

async function skipFrames(sharp, input, size, step) {
    const { GIFEncoder, quantize, applyPalette } = require('gifenc');
    const meta = await sharp(input, { animated: true }).metadata();
    const pages = meta.pages || 1;
    const delays = meta.delay || [];
    const encoder = GIFEncoder();
    for (let page = 0; page < pages; page += step) {
        const { data } = await sharp(input, { page, pages: 1 }).resize(size, size, { fit: 'contain', background: TRANSPARENT })
            .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const palette = quantize(data, 128, { format: 'rgba4444', oneBitAlpha: true });
        const delay = delays.slice(page, page + step).reduce((sum, d) => sum + d, 0) || 40 * step;
        encoder.writeFrame(applyPalette(data, palette, 'rgba4444'), size, size, { palette, delay, transparent: true });
    }
    encoder.finish();
    return Buffer.from(encoder.bytes());
}

if (require.main === module) (async () => {
    const sharp = require('sharp');
    fs.mkdirSync(OUT, { recursive: true });
    const keys = Object.keys(NOTO).filter(key => !ONLY || ONLY.includes(key));
    for (const key of keys) {
        const url = `https://fonts.gstatic.com/s/e/notoemoji/latest/${NOTO[key]}/512.webp`;
        const res = await fetch(url);
        if (!res.ok) { console.log(`  ✖ ${key.padEnd(18)} ${res.status} ${url}`); continue; }
        const { gif, size } = await convert(sharp, Buffer.from(await res.arrayBuffer()));
        fs.writeFileSync(path.join(OUT, `${key.toLowerCase()}.gif`), gif);
        console.log(`  ✔ ${key.padEnd(18)} ${size}px ${(gif.length / 1024).toFixed(0)} Ko`);
    }
})();

module.exports = { NOTO };
