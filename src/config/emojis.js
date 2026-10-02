'use strict';

/**
 * Registre central des emojis personnalisés du bot (pack Hyxo 3D).
 *
 * Ce sont des "Application Emojis" Discord : ils appartiennent au bot
 * lui-même (et pas à un serveur), donc ils s'affichent correctement
 * partout où le bot est présent.
 *
 * ── Régénérer / mettre à jour ────────────────────────────────────
 * 1. node scripts/generateEmojis.js   (dessine assets/emojis/*.png)
 * 2. node scripts/uploadEmojis.js     (upload + remplit les valeurs ci-dessous)
 *
 * Tant qu'une clé vaut `null`, l'emoji Unicode de secours (FALLBACK)
 * est utilisé à la place pour ne jamais casser un message.
 */

const EMOJIS = {
    // Génériques
    SUCCESS: '<a:hx_success:1555601953231478864>',
    ERROR: '<a:hx_error:1555601954984693852>',
    WARNING: '<a:hx_warning:1555601957001887864>',
    INFO: '<a:hx_info:1555601958088482849>',
    LOADING: '<a:hx_loading:1555601960080506891>',

    // Modération
    BAN: '<a:hx_ban:1555601961657573458>',
    UNBAN: '<a:hx_unban:1555601963197010030>',
    KICK: '<a:hx_kick:1555601964409299025>',
    MUTE: '<a:hx_mute:1555601966158184538>',
    UNMUTE: '<a:hx_unmute:1555601967412289538>',
    WARN: '<a:hx_warn:1555601969664757810>',
    TIMEOUT: '<a:hx_timeout:1555601971480625282>',
    LOCK: '<a:hx_lock:1555601973150093506>',
    UNLOCK: '<a:hx_unlock:1555601975322607767>',
    HIDE: '<a:hx_hide:1555601979529765055>',
    UNHIDE: '<a:hx_unhide:1555601980695515237>',
    PRISON: '<a:hx_prison:1555601982763442206>',
    UNPRISON: '<a:hx_unprison:1555601984357142531>',
    ROLE_ADD: '<a:hx_role_add:1555601986710278264>',
    ROLE_REMOVE: '<a:hx_role_remove:1555601988324958279>',
    DERANK: '<a:hx_derank:1555601989965185104>',
    SANCTIONS: '<a:hx_sanctions:1555601992125128734>',

    // Antiraid / Automod
    SHIELD: '<a:hx_shield:1555601996323627170>',
    ROBOT: '<a:hx_robot:1555601998076711044>',

    // Tickets
    TICKET: '<a:hx_ticket:1555602005924515891>',
    TICKET_CLOSE: '<a:hx_ticket_close:1555602007778136086>',
    TICKET_CLAIM: '<a:hx_ticket_claim:1555602009468444753>',
    TICKET_TRANSCRIPT: '<a:hx_ticket_transcript:1555602012190675006>',

    // Giveaway
    GIVEAWAY: '<a:hx_giveaway:1555602013734174780>',
    TROPHY: '<a:hx_trophy:1555602015080554556>',
    GIVEAWAY_REROLL: '<a:hx_giveaway_reroll:1555602016791826533>',

    // Salons vocaux temporaires
    VOICE: '<a:hx_voice:1555602017999781918>',
    VOICE_LOCK: '<a:hx_voice_lock:1555602019723517984>',

    // Logs / Config / Utilitaire
    LOGS: '<a:hx_logs:1555602052590346282>',
    SETTINGS: '<a:hx_settings:1555602030410604546>',

    // Navigation
    ARROW_LEFT: '<a:hx_arrow_left:1555602023842320514>',
    ARROW_RIGHT: '<a:hx_arrow_right:1555602025323175946>',
    HOME: '<a:hx_home:1555602027374059600>',

    // Catégories / divers
    CROWN: '<a:hx_crown:1555602041575968849>',
    BACKUP: '<a:hx_backup:1555602003877699635>',
    OWNER: '<a:hx_owner:1555602043366805597>',
    USER: '<a:hx_user:1555602044440547350>',
    MEMBERS: '<a:hx_members:1555602046252613652>',
    STATS: '<a:hx_stats:1555602054498746388>',
    CLOCK: '<a:hx_clock:1555602070634102934>',
    STAR: '<a:hx_star:1555602073343758386>',
    BELL: '<a:hx_bell:1555602067836502196>',
    TRASH: '<a:hx_trash:1555602040309288960>',
    BOLT: '<a:hx_bolt:1555602080662691900>',
    LINK: '<a:hx_link:1555602058143473667>',
    HEART: '<a:hx_heart:1555602075168276590>',
    FLAME: '<a:hx_flame:1555602076598272054>',
    CALENDAR: '<a:hx_calendar:1555602071913373849>',
    SEARCH: '<a:hx_search:1555602028900647042>',
    EDIT: '<a:hx_edit:1555602038845480962>',
    PLUS: '<a:hx_plus:1555602035972378845>',
    MINUS: '<a:hx_minus:1555602037406826607>',
    MESSAGE: '<a:hx_message:1555602050086080562>',
    CHANNEL: '<a:hx_channel:1555602048731447326>',
    ROLE: '<a:hx_role:1555602047418499236>',
    EMBED: '<a:hx_embed:1555602051583574098>',
    PING: '<a:hx_ping:1555602069187207208>',
    FOLDER: '<a:hx_folder:1555602056088125613>',
    NOTE: '<a:hx_note:1555602057250082836>',
    GLOBE: '<a:hx_globe:1555602087973494844>',
    CAMERA: '<a:hx_camera:1555602089164677240>',
    PALETTE: '<a:hx_palette:1555602090460446733>',
    BARRIER: '<a:hx_barrier:1555602001260322906>',
    SPARKLES: '<a:hx_sparkles:1555602082105393153>',
    ROCKET: '<a:hx_rocket:1555602083816669245>',
    INBOX: '<a:hx_inbox:1555602061540729013>',
    GEM: '<a:hx_gem:1555602085716828213>',
    MAIL: '<a:hx_mail:1555602060311928973>',
    MEGAPHONE: '<a:hx_megaphone:1555602065714057387>',
    ALERT: '<a:hx_alert:1555601999485992970>',
    ON: '<a:hx_on:1555602032365150209>',
    OFF: '<a:hx_off:1555602034072363048>',
    BLOCK: '<a:hx_block:1555602002673926214>',
    LEASH: '<a:hx_leash:1555601994239058061>',
};

// Secours Unicode — utilisé tant que l'emoji custom correspondant
// n'a pas été uploadé (valeur encore à `null` ci-dessus).
const FALLBACK = {
    SUCCESS: '✅', ERROR: '❌', WARNING: '⚠️', INFO: 'ℹ️', LOADING: '⏳',

    BAN: '🔨', UNBAN: '🔓', KICK: '👢', MUTE: '🔇', UNMUTE: '🔊',
    WARN: '⚠️', TIMEOUT: '⏱️', LOCK: '🔒', UNLOCK: '🔓', HIDE: '🙈',
    UNHIDE: '👁️', PRISON: '⛓️', UNPRISON: '🗝️', ROLE_ADD: '➕',
    ROLE_REMOVE: '➖', DERANK: '📉', SANCTIONS: '📋',

    SHIELD: '🛡️', ROBOT: '🤖',

    TICKET: '🎫', TICKET_CLOSE: '🔒', TICKET_CLAIM: '✋', TICKET_TRANSCRIPT: '📄',

    GIVEAWAY: '🎉', TROPHY: '🏆', GIVEAWAY_REROLL: '🔁',

    VOICE: '🎤', VOICE_LOCK: '🔐',

    LOGS: '📜', SETTINGS: '⚙️',

    ARROW_LEFT: '◀️', ARROW_RIGHT: '▶️', HOME: '🏠',

    CROWN: '👑', BACKUP: '💾', OWNER: '🔧', USER: '👤', MEMBERS: '👥',
    STATS: '📊', CLOCK: '⏰', STAR: '⭐', BELL: '🔔', TRASH: '🗑️',
    BOLT: '⚡', LINK: '🔗', HEART: '💜', FLAME: '🔥', CALENDAR: '📅',
    SEARCH: '🔍', EDIT: '✏️', PLUS: '➕', MINUS: '➖', MESSAGE: '💬',
    CHANNEL: '#️⃣', ROLE: '🎭', EMBED: '🧾', PING: '🏓', FOLDER: '📁',
    NOTE: '📝', GLOBE: '🌐', CAMERA: '📸', PALETTE: '🎨', BARRIER: '🚧',
    SPARKLES: '✨', ROCKET: '🚀', INBOX: '📥', GEM: '💎', MAIL: '📧',
    MEGAPHONE: '📢', ALERT: '🚨', ON: '🟢', OFF: '⚫', BLOCK: '🚫', LEASH: '🐕',
};

// Emojis Unicode écrits dans le code → clé du pack. Sert à remplacer
// automatiquement les emojis Unicode par les emojis Hyxo dans les messages.
const UNICODE_ALIASES = {
    '✔️': 'SUCCESS', '✖️': 'ERROR', '⛔': 'BLOCK', '🔴': 'FLAME', '⚪': 'OFF',
    '🔄': 'GIVEAWAY_REROLL', '🎙️': 'VOICE', '🔊': 'UNMUTE', '📂': 'FOLDER',
    '🛠️': 'OWNER', '📡': 'PING', '📣': 'MEGAPHONE', '📩': 'MAIL', '📤': 'INBOX',
    '🖼️': 'CAMERA', '🎥': 'CAMERA', '📖': 'LOGS', '🧹': 'TRASH', '🌍': 'GLOBE',
    '🔏': 'LOCK', '👀': 'UNHIDE', '❤️': 'HEART', '🕐': 'CLOCK',
    '🔑': 'UNPRISON', '📌': 'NOTE', '🆕': 'SPARKLES', '📦': 'BACKUP', '⚖️': 'SANCTIONS',
    '🧨': 'ALERT', '🎯': 'SEARCH', '💡': 'INFO', '🌊': 'MEMBERS', '🔢': 'STATS',
    '👻': 'HIDE', '📍': 'CHANNEL', '🆔': 'USER', '👨': 'USER', '💼': 'OWNER',
    '🔎': 'SEARCH', '👋': 'TICKET_CLOSE', '🚪': 'KICK', '😀': 'USER', '⬜': 'OFF', '🎮': 'STAR',
};
for (const [key, emoji] of Object.entries(FALLBACK)) {
    // Première clé déclarée prioritaire (ex: ⚠️ → WARNING plutôt que WARN).
    if (!(emoji in UNICODE_ALIASES)) UNICODE_ALIASES[emoji] = key;
}

/**
 * Renvoie l'emoji custom pour une clé donnée, ou son fallback Unicode
 * si l'emoji custom n'est pas encore configuré.
 * @param {keyof typeof EMOJIS} key
 * @returns {string}
 */
function getEmoji(key) {
    return EMOJIS[key] || FALLBACK[key] || '';
}

/** Emoji custom (ou null) correspondant à un emoji Unicode du code. */
function customForUnicode(unicode) {
    const key = UNICODE_ALIASES[unicode] || UNICODE_ALIASES[unicode.replace(/️/g, '')] || UNICODE_ALIASES[`${unicode}️`];
    return key ? EMOJIS[key] : null;
}

/** ID de l'emoji custom (ou null) : c'est la clé de `message.reactions.cache` pour un emoji custom. */
function customId(key) {
    return /:(\d+)>$/.exec(EMOJIS[key] || '')?.[1] || null;
}

/** Vrai si une réaction correspond à la clé (emoji Hyxo ou son équivalent Unicode). */
function matchesReaction(emoji, key) {
    if (!emoji) return false;
    const id = customId(key);
    return Boolean((id && emoji.id === id) || emoji.name === FALLBACK[key]);
}

/** Réaction d'un message pour une clé : emoji Hyxo, ou Unicode (anciens messages). */
function findReaction(message, key) {
    const id = customId(key);
    return (id && message.reactions.cache.get(id)) || message.reactions.cache.get(FALLBACK[key]) || null;
}

module.exports = { EMOJIS, FALLBACK, UNICODE_ALIASES, getEmoji, customForUnicode, customId, matchesReaction, findReaction };
