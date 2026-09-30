'use strict';

/**
 * Registre central des emojis personnalisés du bot (pack Xeen 3D).
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
    SUCCESS: '<:x_success:1553817250291781704>',
    ERROR: '<:x_error:1553817251143090208>',
    WARNING: '<:x_warning:1553817252409905182>',
    INFO: '<:x_info:1553817253512740965>',
    LOADING: '<:x_loading:1553817254318313604>',

    // Modération
    BAN: '<:x_ban:1553817255605964940>',
    UNBAN: '<:x_unban:1553817257996587139>',
    KICK: '<:x_kick:1553817259393159280>',
    MUTE: '<:x_mute:1553817261003907093>',
    UNMUTE: '<:x_unmute:1553817262660653188>',
    WARN: '<:x_warn:1553817263524679771>',
    TIMEOUT: '<:x_timeout:1553817264715997238>',
    LOCK: '<:x_lock:1553817266414428244>',
    UNLOCK: '<:x_unlock:1553817267089965229>',
    HIDE: '<:x_hide:1553817268402782291>',
    UNHIDE: '<:x_unhide:1553817269891506277>',
    PRISON: '<:x_prison:1553817271044935904>',
    UNPRISON: '<:x_unprison:1553817272756342875>',
    ROLE_ADD: '<:x_role_add:1553817274031407185>',
    ROLE_REMOVE: '<:x_role_remove:1553817274769473688>',
    DERANK: '<:x_derank:1553817276472500368>',
    SANCTIONS: '<:x_sanctions:1553817278074724494>',

    // Antiraid / Automod
    SHIELD: '<:x_shield:1553817279341531178>',
    ROBOT: '<:x_robot:1553817281086357614>',

    // Tickets
    TICKET: '<:x_ticket:1553817281975296201>',
    TICKET_CLOSE: '<:x_ticket_close:1553817283154153543>',
    TICKET_CLAIM: '<:x_ticket_claim:1553817284706046056>',
    TICKET_TRANSCRIPT: '<:x_ticket_transcript:1553817286026993684>',

    // Giveaway
    GIVEAWAY: '<:x_giveaway:1553817287373488188>',
    TROPHY: '<:x_trophy:1553817289504063668>',
    GIVEAWAY_REROLL: '<:x_giveaway_reroll:1553817291131588638>',

    // Salons vocaux temporaires
    VOICE: '<:x_voice:1553817292377161819>',
    VOICE_LOCK: '<:x_voice_lock:1553817293539123200>',

    // Logs / Config / Utilitaire
    LOGS: '<:x_logs:1553817294684295168>',
    SETTINGS: '<:x_settings:1553817295963431123>',

    // Navigation
    ARROW_LEFT: '<:x_arrow_left:1553817296936374293>',
    ARROW_RIGHT: '<:x_arrow_right:1553817298488270939>',
    HOME: '<:x_home:1553817299390308483>',

    // Catégories / divers
    CROWN: '<:x_crown:1553817300547801098>',
    BACKUP: '<:x_backup:1553817301768208465>',
    OWNER: '<:x_owner:1553817304536588348>',
    USER: '<:x_user:1553817305715048459>',
    MEMBERS: '<:x_members:1553817306780672146>',
    STATS: '<:x_stats:1553817308147879986>',
    CLOCK: '<:x_clock:1553817309318225950>',
    STAR: '<:x_star:1553817310869848065>',
    BELL: '<:x_bell:1553817312933580891>',
    TRASH: '<:x_trash:1553817314061844554>',
    BOLT: '<:x_bolt:1553817315701817344>',
    LINK: '<:x_link:1553817316825899130>',
    HEART: '<:x_heart:1553817317958361189>',
    FLAME: '<:x_flame:1553817319099334657>',
    CALENDAR: '<:x_calendar:1553817320261029909>',
    SEARCH: '<:x_search:1553817321464664114>',
    EDIT: '<:x_edit:1553817322601586688>',
    PLUS: '<:x_plus:1553817323754754089>',
    MINUS: '<:x_minus:1553817324752994314>',
    MESSAGE: '<:x_message:1553817325860561016>',
    CHANNEL: '<:x_channel:1553817326988558367>',
    ROLE: '<:x_role:1553817328020492319>',
    EMBED: '<:x_embed:1553817330771828896>',
    PING: '<:x_ping:1553817339462418544>',
    FOLDER: '<:x_folder:1553817340637085726>',
    NOTE: '<:x_note:1553817341769289839>',
    GLOBE: '<:x_globe:1553817347532398602>',
    CAMERA: '<:x_camera:1553817348668923997>',
    PALETTE: '<:x_palette:1553817350518734878>',
    BARRIER: '<:x_barrier:1553817351655399526>',
    SPARKLES: '<:x_sparkles:1553817352687198319>',
    ROCKET: '<:x_rocket:1553817353878376462>',
    INBOX: '<:x_inbox:1553817355371421886>',
    GEM: '<:x_gem:1553817358487916737>',
    MAIL: '<:x_mail:1553817359175917709>',
    MEGAPHONE: '<:x_megaphone:1553817360757035048>',
    ALERT: '<:x_alert:1553817361914658816>',
    ON: '<:x_on:1553817362967302276>',
    OFF: '<:x_off:1553817364024270858>',
    BLOCK: '<:x_block:1553817365152669868>',
    LEASH: '<:x_leash:1553817366192722002>',
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
// automatiquement les emojis Unicode par les emojis Xeen dans les messages.
const UNICODE_ALIASES = {
    '✔️': 'SUCCESS', '✖️': 'ERROR', '⛔': 'BLOCK', '🔴': 'FLAME', '⚪': 'OFF',
    '🔄': 'GIVEAWAY_REROLL', '🎙️': 'VOICE', '🔊': 'UNMUTE', '📂': 'FOLDER',
    '🛠️': 'OWNER', '📡': 'PING', '📣': 'MEGAPHONE', '📩': 'MAIL', '📤': 'INBOX',
    '🖼️': 'CAMERA', '🎥': 'CAMERA', '📖': 'LOGS', '🧹': 'TRASH', '🌍': 'GLOBE',
    '🔏': 'LOCK', '👀': 'UNHIDE', '❤️': 'HEART', '🕐': 'CLOCK',
    '🔑': 'UNPRISON', '📌': 'NOTE', '🆕': 'SPARKLES', '📦': 'BACKUP', '⚖️': 'SANCTIONS',
    '🧨': 'ALERT', '🎯': 'SEARCH', '💡': 'INFO', '🌊': 'MEMBERS', '🔢': 'STATS',
    '👻': 'HIDE', '📍': 'CHANNEL', '🆔': 'USER', '👨': 'USER', '💼': 'OWNER',
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

/** Vrai si une réaction correspond à la clé (emoji Xeen ou son équivalent Unicode). */
function matchesReaction(emoji, key) {
    if (!emoji) return false;
    const id = customId(key);
    return Boolean((id && emoji.id === id) || emoji.name === FALLBACK[key]);
}

/** Réaction d'un message pour une clé : emoji Xeen, ou Unicode (anciens messages). */
function findReaction(message, key) {
    const id = customId(key);
    return (id && message.reactions.cache.get(id)) || message.reactions.cache.get(FALLBACK[key]) || null;
}

module.exports = { EMOJIS, FALLBACK, UNICODE_ALIASES, getEmoji, customForUnicode, customId, matchesReaction, findReaction };
