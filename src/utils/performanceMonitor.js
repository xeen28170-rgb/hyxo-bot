'use strict';

/**
 * Diagnostic des lenteurs. Mesure en continu :
 *   - le blocage de la boucle Node.js (pendant ce temps, le bot ne traite RIEN) ;
 *   - le processeur utilisé par le bot ;
 *   - la durée des commandes (attente avant traitement + exécution).
 * Écrit un avertissement clair dans la console quand quelque chose est lent, et fournit
 * les chiffres affichés par +ping. Si la boucle est bloquée alors que le bot n'utilise
 * presque pas de processeur, c'est l'hébergeur qui manque de ressources, pas le code.
 */

const { monitorEventLoopDelay } = require('node:perf_hooks');
const Logger = require('./logger');

const SAMPLE_EVERY = 30_000;
const WARN_EVERY = 5 * 60 * 1000;
const LOOP_WARN_MS = 1000;
// Attente avant traitement : le vrai signe d'un bot ralenti. Exécution : plus large, certaines
// commandes attendent volontairement (confirmation, saisie).
const WAIT_WARN_MS = 2000;
const RUN_WARN_MS = 8000;

let histogram = null;
let timer = null;
let lastCpu = process.cpuUsage();
let lastSampleAt = Date.now();
const lastWarn = new Map();
const recent = { loopP99: 0, loopMax: 0, cpuPercent: 0, slowCommands: [] };

function warnOnce(key, text) {
    const now = Date.now();
    if (now - (lastWarn.get(key) || 0) < WARN_EVERY) return;
    lastWarn.set(key, now);
    Logger.warn(text);
}

function sample() {
    const now = Date.now();
    const cpu = process.cpuUsage(lastCpu);
    const elapsed = Math.max(now - lastSampleAt, 1);
    lastCpu = process.cpuUsage();
    lastSampleAt = now;
    recent.cpuPercent = Math.round(((cpu.user + cpu.system) / 1000 / elapsed) * 100);
    recent.loopP99 = Math.round(histogram.percentile(99) / 1e6);
    recent.loopMax = Math.round(histogram.max / 1e6);
    histogram.reset();

    if (recent.loopMax >= LOOP_WARN_MS) {
        const cause = recent.cpuPercent < 40
            ? 'le bot utilise peu de processeur : l\'hébergeur ne lui en donne pas assez (CPU limité ou machine surchargée)'
            : 'le bot utilise beaucoup de processeur : un traitement lourd est en cours';
        warnOnce('loop', `[Perf] Le bot a été bloqué jusqu'à ${recent.loopMax} ms ces 30 dernières secondes (processeur : ${recent.cpuPercent} %) — ${cause}.`);
    }
}

function start() {
    if (timer) return;
    histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
    timer = setInterval(sample, SAMPLE_EVERY);
    timer.unref?.();
}

/**
 * Commande terminée : avertissement si elle a été lente, avec la part d'attente
 * (avant que le bot ne la traite) et la part d'exécution.
 */
function recordCommand(name, createdAt, startedAt, finishedAt = Date.now()) {
    const waited = Math.max(0, startedAt - createdAt);
    const ran = Math.max(0, finishedAt - startedAt);
    if (waited < WAIT_WARN_MS && ran < RUN_WARN_MS) return;
    recent.slowCommands = [...recent.slowCommands, { name, waited, ran, at: finishedAt }].slice(-10);
    const where = waited > ran
        ? 'surtout AVANT le traitement (bot bloqué, réseau ou hébergeur lent)'
        : 'surtout PENDANT l\'exécution (appels Discord lents ou limites de Discord)';
    warnOnce(`cmd:${name}`, `[Perf] Commande ${name} lente : ${waited + ran} ms (attente ${waited} ms, exécution ${ran} ms) — ${where}.`);
}

function stats() {
    const live = histogram ? Math.round(histogram.max / 1e6) : 0;
    return {
        loopP99: recent.loopP99,
        loopMax: Math.max(recent.loopMax, live),
        cpuPercent: recent.cpuPercent,
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        slowCommands: recent.slowCommands,
    };
}

module.exports = { start, recordCommand, stats };
