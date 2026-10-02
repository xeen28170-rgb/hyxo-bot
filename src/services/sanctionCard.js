'use strict';

/**
 * Fiche de sanction animée (GIF) : photo du membre devant une toise, tampon
 * et animation propres à chaque sanction. Jointe au message de confirmation.
 *
 * Polices : Chakra Petch, JetBrains Mono, Anton (SIL Open Font License), dans assets/fonts.
 */

const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const Logger = require('../utils/logger');

const FONTS = ['ChakraPetch-Bold.ttf', 'JetBrainsMono.ttf', 'Anton.ttf']
    .map(file => path.join(__dirname, '../../assets/fonts', file));
const W = 800, H = 300;

const STYLES = {
    ban: { color: '#FF2D4B', stamp: 'BANNI', header: 'FICHE DE SANCTION', anim: 'slam' },
    tempban: { color: '#FF2D4B', stamp: 'BANNI', header: 'FICHE DE SANCTION', anim: 'slam' },
    kick: { color: '#FF8A3D', stamp: 'EXPULSÉ', header: 'FICHE DE SANCTION', anim: 'kick' },
    mute: { color: '#A970FF', stamp: 'MUET', header: 'FICHE DE SANCTION', anim: 'tape' },
    tempmute: { color: '#F5B53D', stamp: 'EXCLU', header: 'FICHE DE SANCTION', anim: 'ring' },
    warn: { color: '#FFD43B', stamp: 'AVERTI', header: 'AVERTISSEMENT', anim: 'warn' },
    unban: { color: '#FF2D4B', stamp: 'BANNI', header: 'SANCTION LEVÉE', anim: 'lift' },
    unmute: { color: '#A970FF', stamp: 'MUET', header: 'SANCTION LEVÉE', anim: 'lift' },
};

const escapeXml = value => String(value ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', '\'': '&apos;' })[c]);
// Les caractères hors des polices (emojis…) ne s'affichent pas : on les retire avant de couper.
const clean = (value, max) => {
    const text = String(value ?? '').replace(/[^\p{L}\p{N}\p{P}\p{Zs}+$^|~<>=`]/gu, '').replace(/\s+/g, ' ').trim();
    return escapeXml(text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text);
};
const ease = t => 1 - Math.pow(1 - t, 3);
const range = (n, fn) => Array.from({ length: n }, (_, i) => fn(i / (n - 1)));

function stamp(x, y, text, color, scale = 1, opacity = 1, rot = -11) {
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})" opacity="${opacity}">
        <rect x="-118" y="-40" width="236" height="80" rx="10" fill="#0B0B0F" fill-opacity=".55" stroke="${color}" stroke-width="6"/>
        <rect x="-108" y="-30" width="216" height="60" rx="6" fill="none" stroke="${color}" stroke-width="2" opacity=".7"/>
        <text x="0" y="15" text-anchor="middle" font-family="Anton" font-size="${text.length > 6 ? 38 : 44}" letter-spacing="6" fill="${color}">${text}</text></g>`;
}

function photo(data, avatar) {
    if (avatar) return `<image href="${avatar}" x="62" y="64" width="156" height="156" clip-path="url(#av)"/>`;
    return `<circle cx="140" cy="142" r="78" fill="#2C2C35"/>
        <text x="140" y="162" text-anchor="middle" font-family="Chakra Petch" font-size="56" fill="#ECEBEF">${clean(data.name, 2).toUpperCase()}</text>`;
}

function card(data, style, avatar, f = {}) {
    let toise = '';
    for (let i = 0; i <= 9; i++) {
        const y = 34 + i * 26;
        toise += `<line x1="26" y1="${y}" x2="254" y2="${y}" stroke="#fff" stroke-opacity="${i % 2 ? 0.08 : 0.18}"/>`;
        if (i % 2 === 0) toise += `<text x="30" y="${y - 4}" font-family="JetBrains Mono" font-size="10" fill="#fff" fill-opacity=".35">${190 - i * 5}</text>`;
    }
    const rows = data.rows.map(([label, value], i) =>
        `<text x="290" y="${182 + i * 30}" font-family="Chakra Petch" font-size="19" fill="#C6C4D1"><tspan font-family="JetBrains Mono" font-size="12" fill="#6F6D7E">${label}</tspan> ${value}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <defs><clipPath id="av"><circle cx="140" cy="142" r="78"/></clipPath><clipPath id="ph"><rect x="26" y="26" width="228" height="248" rx="8"/></clipPath>
        <clipPath id="cardclip"><rect width="${W}" height="${H}" rx="20"/></clipPath>
        <linearGradient id="bg" x1="0" x2="1"><stop offset="0" stop-color="#15151B"/><stop offset="1" stop-color="#0B0B0F"/></linearGradient></defs>
        <rect width="${W}" height="${H}" rx="20" fill="#0B0B0F"/>
        <g clip-path="url(#cardclip)"><g transform="translate(${(f.shift || 0) + (f.shake || 0)} 0)">
        <rect width="${W}" height="${H}" rx="20" fill="url(#bg)"/>
        <rect x="0" y="0" width="6" height="${H}" fill="${style.color}"/>
        <g clip-path="url(#ph)"><rect x="26" y="26" width="228" height="248" fill="#1F2027"/>${toise}
            <g opacity="${f.photoOpacity ?? 1}">${photo(data, avatar)}</g>${f.photo || ''}
            <rect x="46" y="226" width="188" height="34" rx="4" fill="#0B0B0F"/>
            <text x="140" y="249" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="#E9E8EE">HYXO · ${data.caseLabel} · ${data.shortDate}</text></g>
        <text x="290" y="64" font-family="JetBrains Mono" font-size="13" letter-spacing="3" fill="#77768A">${style.header} · DOSSIER #${data.caseLabel}</text>
        <text x="290" y="112" font-family="Chakra Petch" font-size="44" fill="#F4F3F7">${data.name}</text>
        <text x="290" y="138" font-family="JetBrains Mono" font-size="12" fill="#5E5D6E">ID ${data.id}</text>
        ${rows}
        ${f.stampOpacity === 0 ? '' : stamp(668, 214, style.stamp, style.color, (f.stampScale ?? 1) * 0.8, f.stampOpacity ?? 1)}
        ${f.overlay || ''}
        </g></g></svg>`;
}

// ── Animations ────────────────────────────────────────────────────
const slam = () => [...range(8, t => ({ stampScale: 2.4 - 1.4 * ease(t), stampOpacity: 0.15 + 0.85 * t })), ...[6, -5, 3, -2, 1, 0].map(shake => ({ shake }))];
const hold = (f = {}) => ({ ...f, delay: 2600 });

function tape(t, color) {
    const a = Math.min(1, t * 1.6), b = Math.max(0, Math.min(1, t * 1.6 - 0.6));
    const strip = (p, rot, y) => `<g transform="translate(140 ${y}) rotate(${rot})"><rect x="-160" y="-15" width="${320 * p}" height="30" fill="${color}" opacity=".92"/>
        <text x="-150" y="7" font-family="Anton" font-size="18" letter-spacing="5" fill="#0B0B0F" opacity="${p > 0.9 ? 1 : 0}">MUET · MUET · MUET · MUET</text></g>`;
    return strip(a, -18, 150) + strip(b, 14, 172);
}

function ring(t, color) {
    const r = 86, c = 2 * Math.PI * r;
    return `<circle cx="140" cy="142" r="${r}" fill="none" stroke="#2C2C35" stroke-width="8"/>
        <circle cx="140" cy="142" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * t}" transform="rotate(-90 140 142)"/>`;
}

function gauge(lit, max, blink) {
    return Array.from({ length: max }, (_, i) =>
        `<rect x="${574 + i * (186 / max)}" y="122" width="${186 / max - 12}" height="14" rx="7" fill="${i < lit ? '#FFD43B' : '#2C2C35'}" opacity="${i === lit - 1 && blink ? 0.35 : 1}"/>`).join('')
        + `<text x="760" y="152" text-anchor="end" font-family="JetBrains Mono" font-size="13" fill="#FFD43B">${lit} / ${max}</text>`;
}

function strike(t) {
    const x2 = 560 + 220 * t, y2 = 250 - 70 * t;
    return `<line x1="560" y1="250" x2="${x2}" y2="${y2}" stroke="#0B0B0F" stroke-width="10" stroke-linecap="round"/>
        <line x1="560" y1="250" x2="${x2}" y2="${y2}" stroke="#3BD47E" stroke-width="5" stroke-linecap="round"/>`;
}

function frames(style, data) {
    switch (style.anim) {
        case 'kick':
            return [{ stampOpacity: 0, delay: 500 }, ...range(6, t => ({ stampOpacity: 0, shift: 900 * t * t })),
                ...range(7, t => ({ stampOpacity: 0, shift: -900 + 900 * ease(t) })), ...slam(), hold()];
        case 'tape': {
            const done = { photo: tape(1, style.color) };
            return [{ stampOpacity: 0, delay: 400 }, ...range(10, t => ({ stampOpacity: 0, photo: tape(t, style.color) })),
                ...slam().map(f => ({ ...f, ...done })), hold(done)];
        }
        case 'ring': {
            const done = { photo: ring(0.75, style.color), photoOpacity: 0.55 };
            return [...range(14, t => ({ stampOpacity: 0, photo: ring(t * 0.75, style.color), photoOpacity: 1 - t * 0.45, delay: 70 })),
                ...slam().map(f => ({ ...f, ...done })), hold(done)];
        }
        case 'warn': {
            const max = Math.max(3, data.warnCount || 1), lit = Math.min(data.warnCount || 1, max);
            return [...slam().map(f => ({ ...f, overlay: gauge(Math.max(0, lit - 1), max, false) })),
                ...[true, false, true, false, false].map(blink => ({ overlay: gauge(lit, max, blink), delay: 180 })), hold({ overlay: gauge(lit, max, false) })];
        }
        case 'lift': {
            const lifted = t => strike(1) + stamp(560, 112, 'LEVÉ', '#3BD47E', (2.2 - 1.4 * ease(t)) * 0.7, 0.15 + 0.85 * t, 8);
            return [{ delay: 600 }, ...range(6, t => ({ overlay: strike(t) })), ...range(8, t => ({ overlay: lifted(t) })), hold({ overlay: lifted(1) })];
        }
        default:
            return [...slam(), hold()];
    }
}

async function fetchAvatar(user) {
    try {
        const url = user.displayAvatarURL?.({ extension: 'png', size: 256, forceStatic: true });
        if (!url) return null;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) return null;
        return 'data:image/png;base64,' + Buffer.from(await res.arrayBuffer()).toString('base64');
    } catch {
        return null;
    }
}

/**
 * @param {{ type: string, user: import('discord.js').User, moderator?: { username?: string },
 *   reason?: string, duration?: string, caseId?: number, warnCount?: number, since?: string }} input
 * @returns {Promise<{ attachment: Buffer, name: string } | null>}
 */
async function build(input) {
    const style = STYLES[input.type];
    if (!style || !input.user) return null;
    const now = new Date();
    const date = now.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(' ', ' · ');
    const mod = '@' + clean(input.moderator?.username || input.moderator?.displayName || 'Inconnu', 22);
    const rows = input.type === 'unban' || input.type === 'unmute'
        ? [['MOTIF ', clean(input.reason || 'Sanction levée', 24)], ['PAR   ', mod], ['LE    ', date]]
        : [['MOTIF ', clean(input.reason || 'Aucune raison', 24)], ['PAR   ', mod],
            input.type === 'warn' ? ['TOTAL ', `${input.warnCount || 1} avertissement${(input.warnCount || 1) > 1 ? 's' : ''}`]
                : input.type === 'kick' ? ['RETOUR', 'sur invitation']
                    : ['DURÉE ', clean(input.duration || (input.type === 'mute' ? 'indéterminée' : 'définitif'), 26)]];
    const data = {
        name: clean(input.user.username, 15) || 'membre',
        id: escapeXml(input.user.id),
        caseLabel: String(input.caseId ?? 0).padStart(4, '0'),
        shortDate: date.slice(0, 6) + date.slice(8, 10),
        rows,
        warnCount: input.warnCount,
    };

    try {
        const avatar = await fetchAvatar(input.user);
        const gif = GIFEncoder();
        for (const frame of frames(style, data)) {
            const image = new Resvg(card(data, style, avatar, frame), { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Chakra Petch' } }).render();
            const palette = quantize(image.pixels, 256);
            gif.writeFrame(applyPalette(image.pixels, palette), image.width, image.height, { palette, delay: frame.delay || 40 });
            // Laisse respirer la boucle d'événements entre deux images.
            await new Promise(resolve => setImmediate(resolve));
        }
        gif.finish();
        return { attachment: Buffer.from(gif.bytes()), name: `sanction-${data.caseLabel}.gif` };
    } catch (error) {
        Logger.warn(`[SanctionCard] Rendu impossible : ${error.message}`);
        return null;
    }
}

/** Ajoute la fiche à un embed de confirmation. Sans fiche, renvoie l'embed seul. */
async function attach(embed, input) {
    const file = await build(input);
    if (!file) return { embeds: [embed] };
    embed.setImage(`attachment://${file.name}`);
    if (embed.data.thumbnail) delete embed.data.thumbnail;
    return { embeds: [embed], files: [file] };
}

module.exports = { build, attach, STYLES };
