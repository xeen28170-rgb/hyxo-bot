'use strict';

/**
 * Rendu « panneau moderne » (Discord Components V2) pour tout le bot.
 *
 * Chaque message qui contient des embeds est converti au moment de l'envoi :
 *   embed  → Container (barre de couleur) avec titre, texte, avatar en
 *            accessoire, séparateurs, lignes de champs, image, pied de page
 *   boutons/menus → intégrés en bas du dernier panneau
 * Tous les emojis sont retirés (texte, boutons, menus), et une réponse en texte
 * seul devient elle aussi un panneau (cf. plainMessages.textToEmbed).
 * Un envoi avec l'option `raw: true` (texte écrit par un utilisateur) est laissé tel quel.
 *
 * Le code des commandes ne change pas : il continue d'utiliser EmbedBuilder.
 * Si Discord refuse la version V2 (limites de composants/texte), le message
 * est renvoyé automatiquement dans l'ancien format.
 */

const { MessagePayload, MessageFlags, ComponentType } = require('discord.js');
const { stripEmojis, cleanComponents, cleanEmbed, textToEmbed, rewritePrefix } = require('./plainMessages');
const Logger = require('./logger');

const V2 = MessageFlags.IsComponentsV2;
const MAX_TEXT = 3900;          // limite Discord : 4000 caractères de texte au total
const legacyBodies = new WeakMap(); // corps V2 → corps d'origine (repli)

// ─── Emojis ──────────────────────────────────────────────────────

// Les panneaux restent sobres : tous les emojis sont retirés (texte, boutons, menus).
const swapText = stripEmojis;
const swapComponents = cleanComponents;
const swapEmbed = cleanEmbed;

// ─── Conversion embed → panneau ─────────────────────────────────

const text = content => ({ type: ComponentType.TextDisplay, content });
const separator = (divider = true) => ({ type: ComponentType.Separator, divider, spacing: 1 });
const isBlank = s => !s || !String(s).replace(/[\u200B\s]/g, '');

function fieldLine(f) {
    const name = String(f.name ?? '').trim();
    const value = String(f.value ?? '').trim();
    if (isBlank(name)) return value;
    if (isBlank(value)) return `**${name}**`;
    // Valeur courte sur une ligne : « Nom · valeur », sinon bloc titré.
    return !value.includes('\n') && value.length <= 60 ? `**${name}** · ${value}` : `**${name}**\n${value}`;
}

function embedToContainer(e) {
    const children = [];

    const head = [];
    if (!isBlank(e.author?.name)) head.push(`-# ${e.author.name}`);
    if (!isBlank(e.title)) head.push(`### ${e.url ? `[${e.title}](${e.url})` : e.title}`);
    if (!isBlank(e.description)) head.push(e.description);
    const headText = head.join('\n');

    if (headText && e.thumbnail?.url) {
        children.push({
            type: ComponentType.Section,
            components: [text(headText)],
            accessory: { type: ComponentType.Thumbnail, media: { url: e.thumbnail.url } },
        });
    } else if (headText) {
        children.push(text(headText));
    }

    const fields = (e.fields || []).map(fieldLine).filter(Boolean);
    if (fields.length) {
        if (children.length) children.push(separator());
        children.push(text(fields.join('\n')));
    }

    if (e.image?.url) {
        children.push({ type: ComponentType.MediaGallery, items: [{ media: { url: e.image.url } }] });
    }

    const foot = [];
    if (!isBlank(e.footer?.text)) foot.push(e.footer.text);
    if (e.timestamp) foot.push(`<t:${Math.floor(new Date(e.timestamp).getTime() / 1000)}:f>`);
    if (foot.length) {
        if (children.length) children.push(separator(false));
        children.push(text(`-# ${foot.join(' · ')}`));
    }

    if (!children.length) return null;
    const container = { type: ComponentType.Container, components: children };
    if (typeof e.color === 'number') container.accent_color = e.color;
    return container;
}

/** Tronque le texte le plus long jusqu'à respecter la limite globale. */
function enforceTextLimit(components) {
    const texts = [];
    (function collect(list) {
        for (const c of list) {
            if (c.type === ComponentType.TextDisplay) texts.push(c);
            if (Array.isArray(c.components)) collect(c.components);
        }
    })(components);
    let total = texts.reduce((n, t) => n + t.content.length, 0);
    while (total > MAX_TEXT && texts.length) {
        const longest = texts.reduce((a, b) => (b.content.length > a.content.length ? b : a));
        const cut = Math.min(longest.content.length - 1, total - MAX_TEXT + 1);
        if (cut <= 0) break;
        longest.content = `${longest.content.slice(0, longest.content.length - cut)}…`;
        total -= cut - 1;
    }
}

/**
 * Dans un embed, une mention ne notifie jamais. Une fois l'embed converti en texte V2,
 * elle notifierait : on n'autorise donc que les mentions du `content` d'origine,
 * et seulement si les allowed_mentions d'origine les permettaient.
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

function toV2Body(body, { mayEdit }) {
    const containers = body.embeds.map(swapEmbed).map(embedToContainer).filter(Boolean);
    if (!containers.length) return null;

    const top = [];
    if (!isBlank(body.content)) top.push(text(swapText(body.content)));

    const rows = swapComponents(body.components || []);
    if (rows.length) {
        const last = containers[containers.length - 1];
        last.components.push(separator(false), ...rows);
    }
    top.push(...containers);
    enforceTextLimit(top);

    const v2 = { ...body, components: top, flags: (body.flags ?? 0) | V2, allowed_mentions: embedSafeMentions(body) };
    if (mayEdit) {
        // Une modification doit vider l'ancien contenu/embeds du message.
        v2.content = '';
        v2.embeds = [];
    } else {
        delete v2.content;
        delete v2.embeds;
    }
    return v2;
}

// ─── Modification des boutons d'un panneau existant ─────────────

const isV2Type = c => c?.type >= ComponentType.Section;

/** Retire les lignes de boutons/menus (et le séparateur qui les précède). */
function stripRows(components) {
    const out = [];
    for (const c of components) {
        if (c.type === ComponentType.ActionRow) continue;
        if (Array.isArray(c.components) && c.type === ComponentType.Container) {
            const children = c.components.filter(child => child.type !== ComponentType.ActionRow);
            while (children.length && children[children.length - 1].type === ComponentType.Separator) children.pop();
            out.push({ ...c, components: children });
        } else {
            out.push(c);
        }
    }
    return out;
}

/**
 * `edit({ components: [...] })` sur un panneau V2 : sans ça, le panneau entier serait
 * remplacé par les seuls boutons (ou vidé avec `components: []`). On garde le contenu
 * et on remplace uniquement les boutons, en bas du dernier panneau.
 */
function mergeIntoExistingPanel(payload, body) {
    const message = payload.isMessage ? payload.target : payload.isInteraction ? payload.target.message : null;
    if (!message?.flags?.has?.(V2) || body.message_reference) return false;
    if (Array.isArray(body.components) && body.components.some(isV2Type)) return false;

    // Texte seul sur un panneau V2 (interdit par Discord) : il remplace le panneau.
    if (!isBlank(body.content)) {
        body.components = [text(swapText(body.content)), ...swapComponents(body.components || [])];
        delete body.content;
        body.flags = (body.flags ?? 0) | V2;
        return true;
    }
    if (!Array.isArray(body.components)) return false;

    const existing = stripRows((message.components || []).map(c => (typeof c.toJSON === 'function' ? c.toJSON() : c)));
    if (!existing.length) return false;
    const rows = swapComponents(body.components);
    const last = [...existing].reverse().find(c => c.type === ComponentType.Container);
    if (rows.length) {
        if (last) last.components.push(separator(false), ...rows);
        else existing.push(...rows);
    }
    body.components = existing;
    delete body.content;
    body.flags = (body.flags ?? 0) | V2;
    return true;
}

// ─── Installation ────────────────────────────────────────────────

function transform(payload) {
    const body = payload.body;
    if (!body || payload.options?.raw) return;
    rewritePrefix(payload, body);
    textToEmbed(body);
    if (!((body.flags ?? 0) & V2) && !body.embeds?.length && mergeIntoExistingPanel(payload, body)) return;
    // Arborescence déjà en V2 (ex: boutons désactivés d'un panneau) : le flag est obligatoire.
    if (!((body.flags ?? 0) & V2) && body.components?.some(isV2Type)) body.flags = (body.flags ?? 0) | V2;
    if ((body.flags ?? 0) & V2) {
        if (body.components) body.components = swapComponents(body.components);
        return;
    }

    const hasEmbeds = Array.isArray(body.embeds) && body.embeds.length > 0;
    const files = Array.isArray(payload.options?.files) ? payload.options.files : [];
    // Un fichier affiché comme image de l'embed (attachment://) passe dans la galerie du panneau.
    const embedImages = new Set((body.embeds || []).map(e => e?.image?.url).filter(Boolean));
    const filesShownInPanel = files.every(file => embedImages.has('attachment://' + (file?.name ?? file?.attachment?.name)));
    const convertible = hasEmbeds && filesShownInPanel && !body.poll && !body.sticker_ids?.length;

    if (!convertible) {
        // Pas de panneau : on remplace quand même les emojis.
        if (typeof body.content === 'string') body.content = swapText(body.content);
        if (hasEmbeds) body.embeds = body.embeds.map(swapEmbed);
        if (body.components) body.components = swapComponents(body.components);
        return;
    }

    // message.edit() : il faut vider content/embeds d'un ancien message.
    // Interactions (reply/update/editReply) : les messages sont déjà en V2, rien à vider.
    const isMessageEdit = payload.isMessageManager || (payload.isMessage && !body.message_reference);
    const v2 = toV2Body(body, { mayEdit: isMessageEdit });
    if (!v2) return;

    const legacy = { ...body, embeds: body.embeds.map(swapEmbed), components: swapComponents(body.components) };
    if (typeof legacy.content === 'string') legacy.content = swapText(legacy.content);
    payload.body = v2;
    legacyBodies.set(v2, legacy);
}

let warnedFallback = false;
function patchRest(client) {
    const rest = client.rest;
    const original = rest.request.bind(rest);
    rest.request = async function request(options) {
        // Fenêtre de saisie (réponse d'interaction de type 9) : elle ne passe pas par
        // MessagePayload, on retire donc ici les emojis du titre et des libellés.
        // Le texte pré-rempli (`value`) appartient à l'utilisateur et n'est pas touché.
        if (options?.body?.type === 9 && options.body.data) {
            const data = { ...options.body.data };
            if (typeof data.title === 'string') data.title = swapText(data.title).trim() || 'Formulaire';
            if (Array.isArray(data.components)) data.components = swapComponents(data.components);
            options = { ...options, body: { ...options.body, data } };
        }
        try {
            return await original(options);
        } catch (err) {
            const data = options?.body?.data ?? options?.body;
            const legacy = data && typeof data === 'object' ? legacyBodies.get(data) : null;
            if (!legacy || err?.code !== 50035) throw err;
            if (!warnedFallback) {
                warnedFallback = true;
                Logger.warn(`[V2] Panneau refusé par Discord, repli sur l'embed classique: ${err.message}`);
            }
            const retryBody = options.body?.data ? { ...options.body, data: legacy } : legacy;
            return original({ ...options, body: retryBody });
        }
    };
}

let installed = false;
function install(client) {
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
                Logger.error('[V2] Conversion impossible, message envoyé tel quel:', { message: err.message });
            }
        }
        return this;
    };
    patchRest(client);
}

module.exports = { install, toV2Body, swapText, embedToContainer };
