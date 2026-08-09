'use strict';

const axios = require('axios');
const Logger = require('../utils/logger');

const FiveMService = {
    /**
     * Récupérer les informations d'un serveur FiveM via son IP
     */
    async getServerInfo(ip) {
        try {
            const response = await axios.get(`http://${ip}/players.json`, { timeout: 5000 });
            const infoResponse = await axios.get(`http://${ip}/info.json`, { timeout: 5000 });
            
            return {
                online: true,
                players: response.data.length,
                maxPlayers: infoResponse.data.vars.sv_maxclients || '?',
                hostname: infoResponse.data.vars.sv_hostname || ip,
                version: infoResponse.data.version
            };
        } catch {
            try {
                const cfxId = ip.split('/').pop();
                const response = await axios.get(`https://servers-frontend.fivem.net/api/servers/single/${cfxId}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
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
                Logger.error('Erreur FiveM stats:', err.message);
                return { online: false };
            }
        }
    }
};

module.exports = FiveMService;
