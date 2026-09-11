
'use strict';

const Logger = require('./logger');

const AntiCrash = {
    init(client) {
        // Empêche une erreur EPIPE (pipe stdout/stderr cassé, ex: process manager
        // redémarré) de remonter en uncaughtException. Sans ce handler, le
        // uncaughtException ci-dessous tenterait de logger via winston Console,
        // ce qui réécrirait sur le même stream cassé et redéclencherait EPIPE en
        // boucle infinie (des Go de logs générés en quelques secondes).
        process.stdout.on('error', (err) => {
            if (err.code === 'EPIPE') return;
            throw err;
        });
        process.stderr.on('error', (err) => {
            if (err.code === 'EPIPE') return;
            throw err;
        });

        process.on('unhandledRejection', (reason, promise) => {
            Logger.error('Rejet de promesse non géré:', {
                reason: reason?.message || reason,
                stack: reason?.stack,
                promise: promise,
            });
        });

        process.on('uncaughtException', (error) => {
            Logger.error('Exception non capturée:', {
                message: error.message,
                stack: error.stack,
            });
        });

        process.on('uncaughtExceptionMonitor', (error, origin) => {
            Logger.error('Monitor - Exception non capturée:', {
                message: error.message,
                origin: origin,
                stack: error.stack,
            });
        });

        // Note: l'arrêt propre (SIGINT/SIGTERM) est géré de façon unique dans
        // index.js — il doit d'abord flush les sauvegardes en attente AVANT de
        // détruire le client et de quitter. On ne réenregistre pas ces signaux
        // ici pour éviter un process.exit() prématuré qui perdrait des données.

        process.on('warning', (warning) => {
            if (warning.name !== 'MaxListenersExceededWarning') {
                Logger.warn(`Avertissement: ${warning.name} - ${warning.message}`);
            }
        });

        if (client) {
            client.on('error', (error) => {
                Logger.error('Erreur client Discord:', {
                    message: error.message,
                    stack: error.stack,
                });
            });

            client.on('warn', (info) => {
                Logger.warn('Avertissement Discord:', info);
            });

            client.on('invalidated', () => {
                Logger.error('Session Discord invalidée - redémarrage nécessaire');
                process.exit(1);
            });

            client.on('rateLimit', (data) => {
                Logger.warn('Rate limit Discord:', {
                    timeout: data.timeout,
                    limit: data.limit,
                    method: data.method,
                    path: data.path,
                    route: data.route,
                });
            });
        }

        Logger.success('Anti-crash initialisé');
    },
};

module.exports = AntiCrash;
