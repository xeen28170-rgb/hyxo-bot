'use strict';

/**
 * Outils de nettoyage des messages (emojis retirés, texte seul → embed), utilisés par
 * componentsV2.js qui convertit ensuite chaque message en panneau. `install()` reste
 * disponible pour revenir à des embeds classiques sans panneau.
 *
 * Chaque message est nettoyé au moment de l'envoi :
 *   emojis → retirés partout (texte, embeds, boutons, menus). Un ✅ / ❌ qui
 *            porte une information (« Logs : ✅ ») devient « Oui » / « Non ».
 *   ancien panneau (Components V2) modifié → le texte de l'embed y est placé,
 *            car Discord interdit de remettre un embed sur ce type de message.
 *
 * Le code des commandes ne change pas : il continue d'utiliser EmbedHelper.
 * Un envoi avec l'option `raw: true` (texte écrit par un utilisateur : -say,
 * commandes perso, message de bienvenue, -embed) est laissé tel quel.
 */

const { MessagePayload, MessageFlags, ComponentType } = require('discord.js');

const V2 = MessageFlags.IsComponentsV2;
const MAX_CONTENT = 2000;

// ─── Emojis ──────────────────────────────────────────────────────

const CUSTOM_EMOJI = /<a?:\w+:\d+>/g;
// Pictogrammes + modificateurs (variation, ZWJ, couleur de peau, keycap, drapeaux).
const EMOJI_PART = '(?:\\p{Extended_Pictographic}|[\\u{1F1E6}-\\u{1F1FF}]|[\\u{1F3FB}-\\u{1F3FF}]|\\uFE0F|\\u200D|\\u20E3)';
const EMOJI_RUN = new RegExp(`${EMOJI_PART}+`, 'gu');
const LINE_START_EMOJI = new RegExp(`^((?:[>#\\-*_~|\\s]|\\d+\\.)*?)(?:${EMOJI_PART}|<a?:\\w+:\\d+>)+\\s*`, 'gmu');
const YES = /^(?:✅|✔️?|\u{1F7E2}|☑️?)$/u;
const NO = /^(?:❌|✖️?|\u{1F534}|⛔|\u{1F6AB})$/u;

function stripEmojis(text) {
    if (typeof text !== 'string' || !text) return text;
    let out = text
        // Emoji décoratif en début de ligne (« ✅ Salon créé », « **🔒 Sécurité** ») : retiré.
        .replace(LINE_START_EMOJI, '$1')
        .replace(CUSTOM_EMOJI, '')
        // Emoji restant dans la phrase : un statut devient un mot, le reste disparaît.
        // Suivi d'un mot (« ✅ Activé »), il est décoratif : on le retire aussi.
        .replace(EMOJI_RUN, (run, offset, all) => {
            if (/^[ \t]*[\p{L}\p{N}]/u.test(all.slice(offset + run.length))) return '';
            return YES.test(run) ? 'Oui' : NO.test(run) ? 'Non' : '';
        });
    out = out
        .replace(/(\*\*|__)\s+/g, (m, mark, offset, all) => (isOpening(all, offset, mark) ? mark : m))
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+$/gm, '')
        .replace(/^[ \t]+(?=\S)/gm, '');
    return out;
}

// « ** Titre** » laissé par un emoji retiré : on recolle l'ouverture du gras.
function isOpening(all, offset, mark) {
    const before = all.slice(0, offset);
    return before.split(mark).length % 2 === 1;
}

function cleanLabel(text, fallback) {
    const cleaned = stripEmojis(String(text ?? '')).trim();
    return cleaned || fallback;
}

/** Retire les emojis d'une arborescence de composants (JSON API). */
function cleanComponents(components) {
    if (!Array.isArray(components)) return components;
    return components.map(function walk(node) {
        if (!node || typeof node !== 'object') return node;
        const out = { ...node };
        if (out.emoji) {
            const hadLabel = Boolean(out.label);
            delete out.emoji;
            // Un bouton qui n'avait qu'un emoji a besoin d'un texte.
            if (!hadLabel && out.type === ComponentType.Button) out.label = out.style === 5 ? 'Lien' : 'Ouvrir';
        }
        if (typeof out.label === 'string') out.label = cleanLabel(out.label, out.type === ComponentType.Button ? 'Ouvrir' : '-');
        if (typeof out.placeholder === 'string') out.placeholder = cleanLabel(out.placeholder, 'Choisir');
        if (typeof out.content === 'string') out.content = stripEmojis(out.content);
        if (Array.isArray(out.options)) {
            out.options = out.options.map(o => {
                const option = { ...o };
                delete option.emoji;
                option.label = cleanLabel(option.label, '-');
                if (option.description) option.description = cleanLabel(option.description, undefined);
                return option;
            });
        }
        if (Array.isArray(out.components)) out.components = out.components.map(walk);
        if (out.accessory) out.accessory = walk(out.accessory);
        return out;
    });
}

// ─── Embed → texte ──────────────────────────────────────────────

const isBlank = s => !s || !String(s).replace(/[\u200B\s]/g, '');

function fieldLine(f) {
    const name = String(f.name ?? '').trim();
    const value = String(f.value ?? '').trim();
    if (isBlank(name)) return value;
    if (isBlank(value)) return `**${name}**`;
    return !value.includes('\n') && value.length <= 80 ? `**${name}** : ${value}` : `**${name}**\n${value}`;
}

function embedToText(e) {
    const lines = [];
    if (!isBlank(e.author?.name)) lines.push(`-# ${e.author.name}`);
    if (!isBlank(e.title)) lines.push(`**${String(e.title).trim()}**`);
    if (!isBlank(e.description)) lines.push(String(e.description).trim());
    const fields = (e.fields || []).map(fieldLine).filter(s => !isBlank(s));
    if (fields.length) {
        if (lines.length) lines.push('');
        lines.push(...fields);
    }
    // Une image en lien s'affiche via l'aperçu Discord ; un fichier joint s'affiche déjà seul.
    const image = e.image?.url;
    if (image && !image.startsWith('attachment://')) lines.push(image);
    if (!isBlank(e.footer?.text)) lines.push(`-# ${e.footer.text}`);
    return lines.join('\n');
}

function limit(text) {
    if (text.length <= MAX_CONTENT) return text;
    const cut = text.slice(0, MAX_CONTENT - 1);
    const lastBreak = cut.lastIndexOf('\n');
    return `${lastBreak > MAX_CONTENT * 0.6 ? cut.slice(0, lastBreak) : cut}…`;
}

/**
 * Dans un embed, une mention ne notifie jamais. Une fois en texte, elle notifierait :
 * on n'autorise donc que les mentions du `content` d'origine, comme avant.
 */
function embedSafeMentions(body) {
    const original = body.allowed_mentions || { parse: ['users', 'roles'] };
    const parse = original.parse || [];
    const content = String(body.content || '');
    const ids = pattern => [...content.matchAll(pattern)].map(m => m[1]);
    const allowed = (kind, list, found) => found.filter(id => parse.includes(kind) || (list || []).includes(id));
    const safe = {
        parse: parse.includes('everyone') && /@(everyone|here)/.test(content) ? ['everyone'] : [],
        users: [...new Set(allowed('users', original.users, ids(/<@!?(\d+)>/g)))],
        roles: [...new Set(allowed('roles', original.roles, ids(/<@&(\d+)>/g)))],
    };
    if (original.replied_user !== undefined) safe.replied_user = original.replied_user;
    return safe;
}

// ─── Préfixe ─────────────────────────────────────────────────────

/**
 * Beaucoup de textes d'aide écrivent l'ancien préfixe en dur (« `-antilink on` », « =pv »).
 * Un « - » ou « = » suivi d'un vrai nom de commande prend le préfixe du serveur.
 * Le tiret doit être en début de mot (après un espace, ` ou ( ) : « -# », « - liste »
 * et les mots composés ne sont pas touchés.
 */
let prefixPattern = null;
function commandPattern(client) {
    const size = client?.commands?.size || 0;
    if (!size) return null;
    if (prefixPattern?.size === size) return prefixPattern.regex;
    const names = new Set();
    const fixed = new Map(); // commandes à préfixe réservé (« & » pour bl / wet)
    for (const command of client.commands.values()) {
        for (const name of [command.name, ...(command.aliases || [])]) {
            if (!/^[\w-]+$/.test(name)) continue;
            names.add(name);
            if (command.prefix) fixed.set(name.toLowerCase(), command.prefix);
        }
    }
    const alternatives = [...names].sort((a, b) => b.length - a.length).map(n => n.replace(/[-]/g, '\\-')).join('|');
    prefixPattern = { size, fixed, regex: new RegExp(`(^|[\\s\`(])[-=+](${alternatives})(?=$|[\\s\`.,;:!?)\\]])`, 'gmi') };
    return prefixPattern.regex;
}

function guildPrefix(payload) {
    const target = payload.target;
    const client = target?.client;
    if (!client) return null;
    const guildId = target.guildId ?? target.guild?.id ?? target.channel?.guildId ?? null;
    const settings = guildId ? client.cache?.getGuild?.(guildId) : null;
    return { client, prefix: settings?.prefix || client.prefix };
}

function rewritePrefix(payload, body) {
    const info = guildPrefix(payload);
    const regex = info && commandPattern(info.client);
    if (!regex || !info.prefix) return;
    const prefixFor = name => prefixPattern.fixed.get(name.toLowerCase()) || info.prefix;
    const fix = text => (typeof text === 'string' && text ? text.replace(regex, (m, before, name) => `${before}${prefixFor(name)}${name}`) : text);
    if (typeof body.content === 'string') body.content = fix(body.content);
    for (const e of body.embeds || []) {
        e.title = fix(e.title);
        e.description = fix(e.description);
        if (e.footer?.text) e.footer.text = fix(e.footer.text);
        if (e.author?.name) e.author.name = fix(e.author.name);
        for (const f of e.fields || []) { f.name = fix(f.name); f.value = fix(f.value); }
    }
    (function walk(list) {
        for (const c of list || []) {
            if (typeof c.content === 'string') c.content = fix(c.content);
            if (Array.isArray(c.components)) walk(c.components);
        }
    })(body.components);
}

// Discord refuse un champ vide : un texte qui n'était qu'un emoji devient un espace invisible.
const orBlank = text => stripEmojis(String(text ?? '')).trim() || '\u200B';

function cleanEmbed(e) {
    const out = { ...e };
    if (out.title) out.title = stripEmojis(out.title).trim() || undefined;
    if (out.description) out.description = orBlank(out.description);
    if (out.author?.name) out.author = { ...out.author, name: orBlank(out.author.name) };
    if (out.footer?.text) out.footer = { ...out.footer, text: orBlank(out.footer.text) };
    if (out.fields) out.fields = out.fields.map(f => ({ ...f, name: orBlank(f.name), value: orBlank(f.value) }));
    return out;
}

/**
 * Réponse en texte seul (« ❌ Permission requise ») → embed, pour que tout le bot ait le
 * même rendu. La couleur suit l'emoji de tête, retiré ensuite. Un texte qui mentionne
 * quelqu'un reste en texte : dans un embed, la mention ne notifierait plus.
 */
function textToEmbed(body) {
    const content = body.content;
    if (typeof content !== 'string' || isBlank(content) || body.embeds?.length || body.poll) return;
    if (/<@[!&]?\d+>|@everyone|@here/.test(content)) return;
    const { colors } = require('../config/brand');
    const head = content.trimStart();
    const color = /^(?:❌|⛔|\u{1F6AB}|✖|<a?:hx_error:)/u.test(head) ? colors.ERROR
        : /^(?:⚠|<a?:hx_warning:|⏰)/u.test(head) ? colors.WARNING
            : /^(?:✅|✔|<a?:hx_success:)/u.test(head) ? colors.SUCCESS
                : colors.PRIMARY;
    const description = stripEmojis(content).trim();
    if (!description) return;
    body.embeds = [{ color, description: description.slice(0, 4096) }];
    // Vide aussi l'ancien texte quand le message est modifié.
    body.content = '';
}

// ─── Transformation d'un envoi ──────────────────────────────────

function targetMessage(payload) {
    if (payload.isMessage) return payload.target;
    if (payload.isInteraction) return payload.target.message ?? null;
    return null;
}

function transform(payload) {
    const body = payload.body;
    if (!body || payload.options?.raw) return;

    rewritePrefix(payload, body);
    textToEmbed(body);
    const hasEmbeds = Array.isArray(body.embeds) && body.embeds.length > 0;
    if (typeof body.content === 'string') body.content = stripEmojis(body.content);
    if (hasEmbeds) body.embeds = body.embeds.map(cleanEmbed);
    if (body.components) body.components = cleanComponents(body.components);

    // Ancien panneau (Components V2) déjà posté : Discord interdit de lui remettre un embed.
    // Son texte passe dans le panneau, en gardant le format du message.
    const target = targetMessage(payload);
    if (hasEmbeds && target?.flags?.has?.(V2) && !body.message_reference) {
        const parts = [];
        if (!isBlank(body.content)) parts.push(String(body.content));
        parts.push(...body.embeds.map(embedToText).filter(t => !isBlank(t)));
        body.allowed_mentions = embedSafeMentions(body);
        body.content = limit(parts.join('\n\n'));
        delete body.embeds;
    }
    const isV2Tree = Array.isArray(body.components) && body.components.some(c => c?.type >= ComponentType.Section);
    if (isV2Tree && isBlank(body.content)) {
        // Boutons désactivés d'un ancien panneau : on garde son arborescence.
        body.flags = (body.flags ?? 0) | V2;
        delete body.content;
        return;
    }
    if (target?.flags?.has?.(V2) && !body.message_reference && !isBlank(body.content)) {
        const source = body.components ?? (target.components || []).map(c => (typeof c.toJSON === 'function' ? c.toJSON() : c));
        body.components = [
            { type: ComponentType.TextDisplay, content: body.content },
            ...cleanComponents(collectRows(source)),
        ];
        body.flags = (body.flags ?? 0) | V2;
        delete body.content;
        delete body.embeds;
    }
}

// Lignes de boutons/menus, y compris celles rangées dans un ancien panneau.
function collectRows(components, out = []) {
    for (const c of components || []) {
        if (c?.type === ComponentType.ActionRow) out.push(c);
        else if (Array.isArray(c?.components)) collectRows(c.components, out);
    }
    return out;
}

let installed = false;
function install() {
    if (installed) return;
    installed = true;
    const resolveBody = MessagePayload.prototype.resolveBody;
    MessagePayload.prototype.resolveBody = function patchedResolveBody() {
        const alreadyResolved = Boolean(this.body);
        resolveBody.call(this);
        if (!alreadyResolved) {
            try {
                transform(this);
            } catch (err) {
                require('./logger').error('[Texte] Conversion impossible, message envoyé tel quel:', { message: err.message });
            }
        }
        return this;
    };
}

module.exports = { install, stripEmojis, embedToText, cleanComponents, cleanEmbed, textToEmbed, rewritePrefix };
