'use strict';

/**
 * Exécute `worker` sur chaque élément de `items`, avec au plus `limit`
 * exécutions en parallèle.
 *
 * Utilisé pour les boucles qui font un appel Discord (permissionOverwrites.edit,
 * etc.) par salon : en série, un serveur avec 30-40 salons peut prendre
 * 10-30+ secondes avant que la commande ne réponde. En parallèle avec une
 * limite raisonnable, on reste sous le rate-limit par route de discord.js
 * (déjà géré par son REST manager) tout en divisant le temps total par ~N.
 *
 * @param {Array} items
 * @param {(item: any, index: number) => Promise<any>} worker
 * @param {number} [limit=5]
 * @returns {Promise<Array<{ok: boolean, value?: any, error?: any}>>}
 */
async function mapLimit(items, worker, limit = 5) {
    const list = Array.isArray(items) ? items : [...items];
    const results = new Array(list.length);
    let cursor = 0;

    async function runNext() {
        while (cursor < list.length) {
            const index = cursor++;
            try {
                results[index] = { ok: true, value: await worker(list[index], index) };
            } catch (error) {
                results[index] = { ok: false, error };
            }
        }
    }

    const workers = Array.from({ length: Math.min(limit, list.length) }, runNext);
    await Promise.all(workers);
    return results;
}

/**
 * Attend `promise` au plus `ms` millisecondes.
 * - résout { done: true, value } si elle se termine à temps ;
 * - résout { done: false } sinon (la promesse continue en tâche de fond) ;
 * - rejette si elle échoue avant le délai.
 * Utile pour les requêtes que Discord met en file d'attente (ex: renommage de
 * salon limité à 2 par 10 min) et qui feraient sinon "geler" la commande.
 */
function settleWithin(promise, ms) {
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ done: false }), ms); });
    const wrapped = Promise.resolve(promise).then(value => ({ done: true, value }));
    return Promise.race([wrapped, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { mapLimit, settleWithin };
