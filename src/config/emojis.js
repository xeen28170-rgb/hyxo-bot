'use strict';

/**
 * Registre central des emojis personnalisés du bot.
 *
 * Ce sont des "Application Emojis" Discord : ils appartiennent au bot
 * lui-même (et pas à un serveur), donc ils s'affichent correctement
 * partout où le bot est présent, sans dépendre des emojis d'un serveur.
 *
 * ── Comment les activer ──────────────────────────────────────────
 * 1. Dépose des images (png/jpg/gif/webp, 256x256px conseillé) dans
 *    le dossier `assets/emojis/`, un fichier par emoji, nommé comme
 *    la clé ci-dessous en minuscule (ex: ban.png, success.gif).
 * 2. Lance : node scripts/uploadEmojis.js
 * 3. Le script upload chaque image comme emoji d'application et
 *    remplit automatiquement les valeurs ci-dessous.
 *
 * Tant qu'une clé vaut `null`, un emoji Unicode de secours (FALLBACK)
 * est utilisé à la place pour ne jamais casser un embed.
 */

const EMOJIS = {
    // Génériques
    SUCCESS: null,
    ERROR: null,
    WARNING: null,
    INFO: null,
    LOADING: null,

    // Modération
    BAN: null,
    UNBAN: null,
    KICK: null,
    MUTE: null,
    UNMUTE: null,
    WARN: null,
    TIMEOUT: null,
    LOCK: null,
    UNLOCK: null,
    HIDE: null,
    UNHIDE: null,
    PRISON: null,
    UNPRISON: null,
    ROLE_ADD: null,
    ROLE_REMOVE: null,
    DERANK: null,
    SANCTIONS: null,

    // Antiraid / Automod
    SHIELD: null,
    ROBOT: null,

    // Tickets
    TICKET: null,
    TICKET_CLOSE: null,
    TICKET_CLAIM: null,
    TICKET_TRANSCRIPT: null,

    // Giveaway
    GIVEAWAY: null,
    TROPHY: null,
    GIVEAWAY_REROLL: null,

    // Salons vocaux temporaires
    VOICE: null,
    VOICE_LOCK: null,

    // Logs / Config / Utilitaire
    LOGS: null,
    SETTINGS: null,

    // Navigation
    ARROW_LEFT: null,
    ARROW_RIGHT: null,
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

    VOICE: '🔊', VOICE_LOCK: '🔐',

    LOGS: '📜', SETTINGS: '⚙️',

    ARROW_LEFT: '◀️', ARROW_RIGHT: '▶️',
};

/**
 * Renvoie l'emoji custom pour une clé donnée, ou son fallback Unicode
 * si l'emoji custom n'est pas encore configuré.
 * @param {keyof typeof EMOJIS} key
 * @returns {string}
 */
function getEmoji(key) {
    return EMOJIS[key] || FALLBACK[key] || '';
}

module.exports = { EMOJIS, FALLBACK, getEmoji };
