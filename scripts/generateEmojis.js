'use strict';

/**
 * Génère le pack d'emojis Xeen (style « icône 3D » : relief, reflet, halo).
 *
 *   node scripts/generateEmojis.js            # écrit assets/emojis/<clé>.png
 *   node scripts/generateEmojis.js --out=dir  # écrit dans un autre dossier
 *   node scripts/generateEmojis.js --only=BAN,SHIELD
 *
 * Pictogrammes de base : Tabler Icons (MIT). Le rendu 3D (dégradé, extrusion,
 * ombre, reflet, halo) est composé ici puis rasterisé en PNG 256x256 via resvg.
 * Ensuite : node scripts/uploadEmojis.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');

const ROOT = path.join(__dirname, '..');
const TABLER = path.join(ROOT, 'node_modules', '@tabler', 'icons', 'icons');
const arg = (name) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const OUT = path.resolve(ROOT, arg('out') || path.join('assets', 'emojis'));
const ONLY = arg('only')?.split(',').map(s => s.trim().toUpperCase());

// light = reflet haut, base = teinte, dark = flanc/extrusion
const PALETTE = {
    mint:   { light: '#B4F7DD', base: '#3FD39C', dark: '#137A55' },
    coral:  { light: '#FFB3BD', base: '#F2475E', dark: '#98142F' },
    amber:  { light: '#FFE9B0', base: '#F4B63F', dark: '#9C6410' },
    violet: { light: '#D6CEFF', base: '#8C78FA', dark: '#3F2DB0' },
    blue:   { light: '#B9D8FF', base: '#4F95F5', dark: '#1B4FA3' },
    slate:  { light: '#EEF2F6', base: '#A3ADBA', dark: '#48515E' },
    pink:   { light: '#FFC4E3', base: '#EE62AE', dark: '#932463' },
    cyan:   { light: '#B5F4FA', base: '#2EC4D6', dark: '#0C6E7B' },
};

/** clé → [icône Tabler, couleur, variante forcée ('outline'|'filled')?] */
const MANIFEST = {
    // Génériques
    SUCCESS: ['circle-check', 'mint'],
    ERROR: ['circle-x', 'coral'],
    WARNING: ['alert-triangle', 'amber'],
    INFO: ['info-circle', 'blue'],
    LOADING: ['hourglass', 'violet'],

    // Modération
    BAN: ['hammer', 'coral'],
    UNBAN: ['lock-open', 'mint'],
    KICK: ['door-exit', 'amber'],
    MUTE: ['volume-off', 'coral'],
    UNMUTE: ['volume', 'mint'],
    WARN: ['alert-octagon', 'amber'],
    TIMEOUT: ['clock-pause', 'amber'],
    LOCK: ['lock', 'slate'],
    UNLOCK: ['lock-open', 'slate'],
    HIDE: ['eye-off', 'slate'],
    UNHIDE: ['eye', 'cyan'],
    PRISON: ['lock-square-rounded', 'violet'],
    UNPRISON: ['key', 'amber'],
    ROLE_ADD: ['user-plus', 'mint'],
    ROLE_REMOVE: ['user-minus', 'coral'],
    DERANK: ['trending-down', 'coral'],
    SANCTIONS: ['clipboard-list', 'violet'],

    // Antiraid / Automod
    SHIELD: ['shield-lock', 'violet'],
    ROBOT: ['robot', 'cyan'],

    // Tickets
    TICKET: ['ticket', 'blue'],
    TICKET_CLOSE: ['circle-x', 'coral'],
    TICKET_CLAIM: ['hand-stop', 'mint'],
    TICKET_TRANSCRIPT: ['file-text', 'slate'],

    // Giveaway
    GIVEAWAY: ['gift', 'pink'],
    TROPHY: ['trophy', 'amber'],
    GIVEAWAY_REROLL: ['refresh', 'pink'],

    // Vocaux
    VOICE: ['microphone', 'cyan'],
    VOICE_LOCK: ['microphone-off', 'slate'],

    // Logs / Config
    LOGS: ['file-description', 'blue'],
    SETTINGS: ['settings', 'slate'],

    // Navigation
    ARROW_LEFT: ['chevron-left', 'slate', 'outline'],
    ARROW_RIGHT: ['chevron-right', 'slate', 'outline'],
    HOME: ['home', 'blue'],

    // Catégories du help / divers
    CROWN: ['crown', 'amber'],
    BACKUP: ['database', 'cyan'],
    OWNER: ['tool', 'violet'],
    USER: ['user', 'blue'],
    MEMBERS: ['users', 'blue'],
    STATS: ['chart-bar', 'cyan'],
    CLOCK: ['clock', 'blue'],
    STAR: ['star', 'amber'],
    BELL: ['bell', 'amber'],
    TRASH: ['trash', 'coral'],
    BOLT: ['bolt', 'amber'],
    LINK: ['link', 'blue'],
    HEART: ['heart', 'pink'],
    FLAME: ['flame', 'coral'],
    CALENDAR: ['calendar', 'blue'],
    SEARCH: ['search', 'slate'],
    EDIT: ['pencil', 'blue'],
    PLUS: ['circle-plus', 'mint'],
    MINUS: ['circle-minus', 'coral'],
    MESSAGE: ['message-circle', 'blue'],
    CHANNEL: ['message-2', 'slate'],
    ROLE: ['tag', 'violet'],
    EMBED: ['layout-cards', 'violet'],
    PING: ['wifi', 'mint', 'outline'],
    FOLDER: ['folder', 'blue'],
    NOTE: ['notes', 'slate'],
    GLOBE: ['world', 'blue'],
    CAMERA: ['camera', 'cyan'],
    PALETTE: ['palette', 'pink'],
    BARRIER: ['barrier-block', 'amber'],
    SPARKLES: ['sparkles', 'violet'],
    ROCKET: ['rocket', 'violet'],
    INBOX: ['inbox', 'blue'],
    GEM: ['diamond', 'cyan'],
    MAIL: ['mail', 'blue'],
    MEGAPHONE: ['speakerphone', 'amber'],
    ALERT: ['urgent', 'coral'],
    ON: ['circle', 'mint', 'filled'],
    OFF: ['circle', 'slate', 'filled'],
    BLOCK: ['ban', 'coral'],
    LEASH: ['paw', 'amber'],
};

function loadIcon(name, forced) {
    const variants = forced ? [forced] : ['filled', 'outline'];
    for (const variant of variants) {
        const file = path.join(TABLER, variant, `${name}.svg`);
        if (!fs.existsSync(file)) continue;
        const svg = fs.readFileSync(file, 'utf8');
        const shapes = [...svg.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*?)\/?>/g)]
            .map(m => ({ tag: m[1], attrs: m[2].replace(/\s+/g, ' ').trim() }))
            .filter(s => !/stroke="none"[^>]*d="M0 0h24v24H0z"/.test(s.attrs) && !/d="M0 0h24v24H0z"/.test(s.attrs));
        return { variant, shapes };
    }
    throw new Error(`Icône Tabler introuvable: ${name}`);
}

/** Dessine le glyphe avec une peinture donnée (couleur ou url(#grad)). */
function glyph(icon, paint, extra = '') {
    const inner = icon.shapes.map(s => `<${s.tag} ${s.attrs.replace(/\b(fill|stroke)="[^"]*"/g, '')}/>`).join('');
    return icon.variant === 'filled'
        ? `<g fill="${paint}" stroke="${paint}" stroke-width="0.35" stroke-linejoin="round" ${extra}>${inner}</g>`
        : `<g fill="none" stroke="${paint}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</g>`;
}

function buildSvg(icon, c) {
    const depth = [0.22, 0.44, 0.66, 0.88]
        .map(dy => glyph(icon, c.dark, `transform="translate(0 ${dy})"`)).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1.5 -1.5 27 27" width="256" height="256">
<defs>
  <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${c.light}"/>
    <stop offset="0.45" stop-color="${c.base}"/>
    <stop offset="1" stop-color="${c.base}"/>
  </linearGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/>
    <stop offset="0.38" stop-color="#FFFFFF" stop-opacity="0.12"/>
    <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
  </linearGradient>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1"/></filter>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0.55"/></filter>
</defs>
<g opacity="0.55" filter="url(#glow)">${glyph(icon, c.base)}</g>
<g opacity="0.45" filter="url(#shadow)">${glyph(icon, '#05060A', 'transform="translate(0.3 1.5)"')}</g>
${depth}
${glyph(icon, 'url(#face)')}
${glyph(icon, 'url(#gloss)', 'transform="translate(-0.12 -0.12)" opacity="0.9"')}
</svg>`;
}

function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const keys = Object.keys(MANIFEST).filter(k => !ONLY || ONLY.includes(k));
    for (const key of keys) {
        const [name, color, forced] = MANIFEST[key];
        const icon = loadIcon(name, forced);
        const svg = buildSvg(icon, PALETTE[color]);
        const png = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } }).render().asPng();
        fs.writeFileSync(path.join(OUT, `${key.toLowerCase()}.png`), png);
    }
    console.log(`${keys.length} emoji(s) générés dans ${path.relative(ROOT, OUT)}`);
}

if (require.main === module) main();

module.exports = { MANIFEST, PALETTE };
