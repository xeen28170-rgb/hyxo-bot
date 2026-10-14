'use strict';

/**
 * Sauvegarde de TOUTES les données du bot dans Discord (config des serveurs, tickets,
 * commandes perso, sanctions, giveaways, vocaux, rappels, logs…), pour ne plus rien
 * perdre quand le dossier data du VPS est vidé ou remplacé (nouvel envoi du code).
 *
 *   Stockage : un message par fichier de data/ (compressé), plus un « sommaire »,
 *              dans les MP du propriétaire du bot (ou le salon CONFIG_BACKUP_CHANNEL).
 *              Chaque message est modifié à chaque changement : jamais de doublons.
 *   Envoi    : toutes les 10 minutes, seulement les fichiers qui ont changé.
 *   Retour   : au démarrage, AVANT la connexion du bot, si data/ est vide ou plus ancien
 *              que la sauvegarde, tous les fichiers sont remis. Le bot démarre ensuite
 *              normalement, avec ses données.
 *
 * data/.cloud-state.json retient la date de la dernière sauvegarde envoyée : c'est elle
 * qui dit si les fichiers locaux sont à jour (un vieux data/ envoyé par erreur n'en a pas).
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { promisify } = require('node:util');

const gzip = promisify(zlib.gzip);
const Logger = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '../../data');
const STATE_FILE = path.join(DATA_DIR, '.cloud-state.json');
const MARK = 'hyxo-backup:';
const OLD_MARK = 'hyxo-config:';     // ancien format (config des serveurs seulement)
const MANIFEST = 'sommaire';
const SYNC_INTERVAL = 10 * 60 * 1000;
const FIRST_SYNC_DELAY = 60 * 1000;
const SCAN_PAGES = 30;              // 30 × 100 messages lus au plus
const SEND_GAP = 1200;              // pause entre deux envois : pas de rafale vers Discord
const MAX_FILE = 9.5 * 1024 * 1024; // limite Discord : 10 Mo par fichier envoyé par un bot
const RESTORE_TIMEOUT = 30_000;     // le démarrage n'attend jamais plus longtemps

const index = new Map();            // clé → { messageId, hash }
let storage = null;
let scanned = false;
let timer = null;
let pendingSync = null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hashOf = buffer => crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 12);
const header = (key, savedAt, hash) => `${MARK}${key} · ${savedAt} · ${hash}`;

function parseHeader(content) {
    const match = /^hyxo-backup:([\w.-]+) · (\S+) · ([0-9a-f]+)/.exec(content || '');
    return match ? { key: match[1], savedAt: match[2], hash: match[3] } : null;
}

function ownerId() {
    return (process.env.BOT_PROPRIETAIRE_ID || (process.env.OWNER_IDS || '').split(',')[0] || '').trim() || null;
}

function dataFiles() {
    if (!fs.existsSync(DATA_DIR)) return [];
    return fs.readdirSync(DATA_DIR).filter(name => name.endsWith('.json') && !name.startsWith('.'));
}

function readState() {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}

function writeState(savedAt) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ savedAt }));
}

// Écriture atomique : un arrêt brutal ne laisse jamais un fichier à moitié écrit.
function writeDataFile(name, buffer) {
    const target = path.join(DATA_DIR, path.basename(name));
    const temp = `${target}.${process.pid}.restore.tmp`;
    fs.writeFileSync(temp, buffer);
    fs.renameSync(temp, target);
}

// ─── Restauration : avant la connexion, avec l'API REST seule ────────

async function restoreBeforeLogin(token) {
    // Bot lancé en plusieurs shards : un seul processus restaure, sinon écritures en double.
    if (process.env.SHARDS && !String(process.env.SHARDS).split(',').includes('0')) return 0;
    const work = restoreFromDiscord(token);
    const timeout = sleep(RESTORE_TIMEOUT).then(() => { throw new Error('Discord ne répond pas, démarrage avec les fichiers locaux'); });
    try {
        return await Promise.race([work, timeout]);
    } catch (error) {
        Logger.warn(`[Sauvegarde] Vérification au démarrage impossible : ${error.message}`);
        return 0;
    }
}

async function restoreFromDiscord(token) {
    const { REST, Routes } = require('discord.js');
    const rest = new REST({ version: '10', timeout: 15_000 }).setToken(token);
    const me = await rest.get(Routes.user());
    const channelId = (process.env.CONFIG_BACKUP_CHANNEL || '').trim()
        || (ownerId() ? (await rest.post(Routes.userChannels(), { body: { recipient_id: ownerId() } })).id : null);
    if (!channelId) return 0;

    // Messages du bot dans l'emplacement de sauvegarde, du plus récent au plus ancien.
    const messages = new Map();
    let manifestMessage = null;
    let before;
    for (let page = 0; page < SCAN_PAGES; page++) {
        const query = new URLSearchParams({ limit: '100' });
        if (before) query.set('before', before);
        const batch = await rest.get(Routes.channelMessages(channelId), { query });
        if (!batch?.length) break;
        for (const message of batch) {
            if (message.author?.id !== me.id) continue;
            messages.set(message.id, message);
            if (!manifestMessage && parseHeader(message.content)?.key === MANIFEST) manifestMessage = message;
        }
        before = batch[batch.length - 1].id;
        if (batch.length < 100) break;
    }
    if (!manifestMessage) return 0;

    const download = async message => {
        const url = message?.attachments?.[0]?.url;
        if (!url) throw new Error('pièce jointe manquante');
        const response = await fetch(url);
        if (!response.ok) throw new Error(`téléchargement HTTP ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
    };
    const manifest = JSON.parse((await download(manifestMessage)).toString('utf8'));
    const local = readState();
    if (local?.savedAt && local.savedAt >= manifest.savedAt) return 0;

    // Tout est téléchargé et vérifié AVANT d'écrire quoi que ce soit : pas de data/ à moitié remis.
    const files = [];
    for (const entry of manifest.files || []) {
        const message = messages.get(entry.messageId)
            || await rest.get(Routes.channelMessage(channelId, entry.messageId)).catch(() => null);
        const buffer = zlib.gunzipSync(await download(message));
        if (hashOf(buffer) !== entry.hash) throw new Error(`${entry.name} : fichier abîmé`);
        JSON.parse(buffer.toString('utf8'));
        files.push({ name: entry.name, buffer });
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const file of files) writeDataFile(file.name, file.buffer);
    writeState(manifest.savedAt);
    Logger.success(`[Sauvegarde] ${files.length} fichier(s) de données remis depuis la sauvegarde Discord du ${new Date(manifest.savedAt).toLocaleString('fr-FR')}.`);
    return files.length;
}

// ─── Sauvegarde : après la connexion ─────────────────────────────────

async function getStorage(client) {
    if (storage) return storage;
    const channelId = (process.env.CONFIG_BACKUP_CHANNEL || '').trim();
    if (channelId) {
        storage = await client.channels.fetch(channelId).catch(() => null);
        if (storage?.isTextBased?.()) return storage;
        Logger.warn(`[Sauvegarde] Salon CONFIG_BACKUP_CHANNEL ${channelId} introuvable, repli sur les MP du propriétaire.`);
        storage = null;
    }
    const id = ownerId();
    const user = id ? await client.users.fetch(id).catch(() => null) : null;
    storage = user ? await user.createDM().catch(() => null) : null;
    return storage;
}

/** Relit les messages de sauvegarde déjà postés ; retire ceux de l'ancien format. */
async function scan(client) {
    const channel = await getStorage(client);
    if (!channel) return false;
    index.clear();
    let before;
    for (let page = 0; page < SCAN_PAGES; page++) {
        const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
        if (!batch?.size) break;
        for (const message of batch.values()) {
            if (message.author?.id !== client.user.id) continue;
            if (message.content?.startsWith(OLD_MARK)) { await message.delete().catch(() => {}); continue; }
            const parsed = parseHeader(message.content);
            if (parsed && !index.has(parsed.key)) index.set(parsed.key, { messageId: message.id, hash: parsed.hash });
        }
        before = batch.last().id;
        if (batch.size < 100) break;
    }
    scanned = true;
    return true;
}

async function upload(channel, key, savedAt, hash, file, note) {
    const payload = {
        content: `${header(key, savedAt, hash)}\n-# ${note}`,
        files: [file],
        allowedMentions: { parse: [] },
        flags: 4096, // message silencieux : pas de notification
        // Message technique : jamais converti en panneau.
        raw: true,
    };
    const current = index.get(key);
    let message = current?.messageId ? await channel.messages.fetch(current.messageId).catch(() => null) : null;
    if (message) {
        delete payload.flags;
        message = await message.edit({ ...payload, attachments: [] });
    } else {
        message = await channel.send(payload);
    }
    index.set(key, { messageId: message.id, hash });
    return message.id;
}

/** Envoie les fichiers de data/ qui ont changé, puis le sommaire. */
async function syncAll(client) {
    const channel = await getStorage(client);
    if (!channel) return 0;
    if (!scanned) await scan(client);
    const savedAt = new Date().toISOString();
    const files = [];
    let sent = 0;
    for (const name of dataFiles()) {
        try {
            // Lecture et compression en tâche de fond : le bot continue de répondre pendant la sauvegarde.
            const buffer = await fs.promises.readFile(path.join(DATA_DIR, name));
            const hash = hashOf(buffer);
            const known = index.get(name);
            if (known?.hash === hash) { files.push({ name, messageId: known.messageId, hash }); continue; }
            JSON.parse(buffer.toString('utf8')); // jamais de sauvegarde d'un fichier abîmé (seulement s'il a changé)
            const gz = await gzip(buffer, { level: 6 });
            if (gz.length > MAX_FILE) {
                Logger.warn(`[Sauvegarde] ${name} est trop gros pour Discord (${Math.round(gz.length / 1024 / 1024)} Mo compressé), ignoré.`);
                if (known) files.push({ name, messageId: known.messageId, hash: known.hash });
                continue;
            }
            const messageId = await upload(channel, name, savedAt, hash, { attachment: gz, name: `${name}.gz` },
                'Sauvegarde automatique du bot. Ne pas supprimer : elle sert à tout remettre.');
            files.push({ name, messageId, hash });
            sent++;
            await sleep(SEND_GAP);
        } catch (error) {
            Logger.warn(`[Sauvegarde] ${name} non sauvegardé : ${error.message}`);
        }
    }
    if (sent || !index.has(MANIFEST)) {
        const manifest = Buffer.from(JSON.stringify({ savedAt, files }, null, 1));
        await upload(channel, MANIFEST, savedAt, hashOf(manifest), { attachment: manifest, name: 'sommaire.json' },
            `Sommaire de la sauvegarde : ${files.length} fichier(s). Ne pas supprimer.`);
        writeState(savedAt);
    }
    return sent;
}

function run(client) {
    return syncAll(client).catch(error => Logger.warn(`[Sauvegarde] ${error.message}`));
}

function start(client) {
    if (timer) clearInterval(timer);
    setTimeout(() => run(client), FIRST_SYNC_DELAY).unref?.();
    timer = setInterval(() => run(client), SYNC_INTERVAL);
    timer.unref?.();
}

/** Sauvegarde rapprochée (le bot vient de rejoindre un serveur), regroupée sur 30 s. */
function requestSync(client) {
    if (pendingSync) return;
    pendingSync = setTimeout(() => { pendingSync = null; run(client); }, 30_000);
    pendingSync.unref?.();
}

module.exports = { restoreBeforeLogin, syncAll, start, requestSync };
