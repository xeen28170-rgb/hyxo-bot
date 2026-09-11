'use strict';

const axios = require('axios');
const Logger = require('../utils/logger');

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d{1,5}))?$/;
const CFX_ID_RE = /^[A-Za-z0-9_-]+$/;

function parseIp(input) {
    if (typeof input !== 'string') return null;
    let target = input.trim();
    if (!target) return null;

    // Mode "lien cfx.re" : on ne fait PAS de requête HTTP vers l'entrée utilisateur.
    if (target.includes('cfx.re')) {
        const id = target.split('/').pop().trim();
        return { mode: 'cfx', id };
    }

    // Sinon l'entrée doit être une adresse IP publique (optionnellement :port).
    const match = target.match(IPV4_RE);
    if (!match) return null;

    const [a, b, c, d] = [match[1], match[2], match[3], match[4]].map(Number);
    if (a > 255 || b > 255 || c > 255 || d > 255) return null;

    const port = match[5] ? parseInt(match[5], 10) : 30120;
    if (port < 1 || port > 65535) return null;

    // Blocage SSRF : adresses non routables / locales.
    if (a === 127) return null;                    // 127.0.0.0/8
    if (a === 0) return null;                       // 0.0.0.0/8
    if (a === 10) return null;                      // 10.0.0.0/8
    if (a === 169 && b === 254) return null;        // 169.254.0.0/16 (link-local)
    if (a === 172 && b >= 16 && b <= 31) return null; // 172.16.0.0/12
    if (a === 192 && b === 168) return null;        // 192.168.0.0/16
    if (a === 224 || a === 239) return null;        // multicast
    if (a >= 240) return null;                      // réservé / broadcast

    return { mode: 'direct', ip: `${a}.${b}.${c}.${d}`, port };
}

const FiveMService = {
    parseIp,

    /**
     * Récupérer les informations d'un serveur FiveM via son IP ou son lien cfx.re
     */
    async getServerInfo(input) {
        const parsed = parseIp(input);

        if (parsed && parsed.mode === 'cfx') {
            if (!CFX_ID_RE.test(parsed.id)) {
                Logger.error('FiveM stats: ID cfx invalide.');
                return { online: false, error: 'cfx_id_invalide' };
            }
            try {
                const url = `https://servers-frontend.fivem.net/api/servers/single/${encodeURIComponent(parsed.id)}`;
                const response = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 5000,
                });
                const data = response.data.Data;
                return {
                    online: true,
                    players: data.players.length,
                    maxPlayers: data.sv_maxclients,
                    hostname: data.hostname,
                    version: data.server
                };
            } catch (err) {
                Logger.error('Erreur FiveM stats (cfx):', err.message);
                return { online: false };
            }
        }

        if (parsed && parsed.mode === 'direct') {
            try {
                const base = `http://${parsed.ip}:${parsed.port}`;
                const response = await axios.get(`${base}/players.json`, { timeout: 5000 });
                const infoResponse = await axios.get(`${base}/info.json`, { timeout: 5000 });
                return {
                    online: true,
                    players: response.data.length,
                    maxPlayers: infoResponse.data.vars.sv_maxclients || '?',
                    hostname: infoResponse.data.vars.sv_hostname || `${parsed.ip}:${parsed.port}`,
                    version: infoResponse.data.version
                };
            } catch (err) {
                Logger.error('Erreur FiveM stats (direct):', err.message);
                return { online: false };
            }
        }

        Logger.error('FiveM stats: adresse invalide / refusée (SSRF).');
        return { online: false, error: 'adresse_invalide' };
    }
};

module.exports = FiveMService;
