'use strict';

const fs = require('fs');
const path = require('path');

// Sur un hébergeur conteneurisé (Pterodactyl/Katabump...), chaque redémarrage
// du conteneur repart avec un espace de PID vierge. Si le process précédent a été
// tué brutalement (crash, kill -9, OOM, bouton "Kill" du panel) sans passer par
// le handler d'arrêt propre, le PID enregistré dans le verrou n'a jamais été
// libéré. Comme la séquence de démarrage du conteneur est identique à chaque
// fois, le NOUVEAU process Node peut très bien recevoir exactement le même PID
// (ou un PID recyclé par un autre process) : `process.kill(pid, 0)` réussit
// alors que ce n'est pas du tout la même instance du bot, et le verrou bloque
// indéfiniment tous les démarrages suivants. On vérifie donc en plus, via
// /proc/{pid}/cmdline (Linux — système de tous les hébergeurs de bots Discord),
// que le PID correspond bien à un process Node exécutant ce même script.
function isSameProcess(pid) {
    try {
        const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
        const parts = cmdline.split('\0').filter(Boolean);
        const isNode = parts.some(p => /node(\.exe)?$/i.test(p));
        const entryName = path.basename(require.main?.filename || process.argv[1] || '');
        const runsThisEntry = entryName && parts.some(p => p.includes(entryName));
        return isNode && runsThisEntry;
    } catch {
        // /proc indisponible (non-Linux, ou lecture refusée) : on ne peut pas
        // vérifier, donc on reste prudent comme avant (on suppose que ça pourrait
        // être la même instance).
        return true;
    }
}

function acquireInstanceLock(directory) {
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, '.bot-instance.lock');
    for (let attempt = 0; attempt < 2; attempt++) {
        let fd;
        try { fd = fs.openSync(file, 'wx'); } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            const pid = Number(fs.readFileSync(file, 'utf8'));
            if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Verrou de stockage invalide : verification manuelle requise.');
            try { process.kill(pid, 0); } catch (probeError) {
                if (probeError.code === 'ESRCH') { fs.unlinkSync(file); continue; }
                throw probeError;
            }
            // Le PID existe bel et bien, mais s'il s'agit de nous-même (recyclage
            // total) ou d'un process qui n'est manifestement pas cette instance du
            // bot (recyclage partiel), le verrou est périmé, pas un vrai conflit.
            if (pid === process.pid || !isSameProcess(pid)) {
                fs.unlinkSync(file);
                continue;
            }
            throw new Error(`Une instance utilise deja les donnees JSON (PID ${pid}). Multi-instance/multi-shard interdit avec ce stockage.`);
        }
        try { fs.writeFileSync(fd, String(process.pid)); } finally { fs.closeSync(fd); }
        return () => {
            try { if (fs.readFileSync(file, 'utf8') === String(process.pid)) fs.unlinkSync(file); } catch { /* deja libere */ }
        };
    }
    throw new Error('Impossible de verrouiller le stockage JSON.');
}

module.exports = { acquireInstanceLock };

