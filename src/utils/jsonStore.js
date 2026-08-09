'use strict';

/**
 * Écriture JSON atomique.
 *
 * Le problème résolu : `fs.writeFile(FICHIER, ...)` écrit directement dans le
 * fichier cible. Si le process est tué en pleine écriture, le fichier se
 * retrouve tronqué → JSON invalide → au prochain démarrage le modèle repart sur
 * un store vide (perte totale des données).
 *
 * La parade : on écrit d'abord dans un fichier temporaire situé dans le MÊME
 * dossier, puis on fait un `rename` (opération atomique sur un même système de
 * fichiers). À tout instant, le fichier cible est soit l'ancienne version
 * complète, soit la nouvelle version complète — jamais un état intermédiaire.
 */

const fs = require('fs');
const path = require('path');

let counter = 0;

function tempPath(file) {
    counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
    return path.join(
        path.dirname(file),
        `.${path.basename(file)}.${process.pid}.${Date.now()}.${counter}.tmp`
    );
}

/**
 * Écriture atomique synchrone (utilisée pour le flush de dernière chance à l'arrêt).
 * @param {string} file - Chemin absolu du fichier cible
 * @param {*} data - Valeur à sérialiser en JSON
 * @param {{spaces?: number}} [options]
 */
function writeJsonSync(file, data, { spaces = 2 } = {}) {
    const tmp = tempPath(file);
    try {
        fs.writeFileSync(tmp, JSON.stringify(data, null, spaces), 'utf8');
        fs.renameSync(tmp, file);
    } catch (err) {
        try { fs.unlinkSync(tmp); } catch { /* le temp n'existe peut-être pas */ }
        throw err;
    }
}

/**
 * Écriture atomique asynchrone (chemin normal des sauvegardes debouncées).
 * @param {string} file - Chemin absolu du fichier cible
 * @param {*} data - Valeur à sérialiser en JSON
 * @param {{spaces?: number}} [options]
 */
async function writeJson(file, data, { spaces = 2 } = {}) {
    const fsp = fs.promises;
    const tmp = tempPath(file);
    try {
        await fsp.writeFile(tmp, JSON.stringify(data, null, spaces), 'utf8');
        await fsp.rename(tmp, file);
    } catch (err) {
        try { await fsp.unlink(tmp); } catch { /* le temp n'existe peut-être pas */ }
        throw err;
    }
}

module.exports = { writeJson, writeJsonSync };
