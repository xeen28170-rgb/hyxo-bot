'use strict';

const Logger = require('./logger');

const pendingSaves = new Map();

const ModelRegistry = {
    /**
     * Enregistrer une fonction de sauvegarde synchrone pour un fichier
     * @param {string} filePath - Chemin absolu du fichier
     * @param {Function} saveFn - Fonction d'écriture synchrone
     */
    register(filePath, saveFn) {
        pendingSaves.set(filePath, saveFn);
    },

    /**
     * Retirer un fichier du registre (sauvegarde effectuée)
     * @param {string} filePath - Chemin absolu du fichier
     */
    unregister(filePath) {
        pendingSaves.delete(filePath);
    },

    /**
     * Écrire immédiatement et de façon synchrone tous les modèles en attente
     */
    flushAll() {
        if (pendingSaves.size === 0) return;
        Logger.info(`[SHUTDOWN] Sauvegarde finale de ${pendingSaves.size} fichiers de données...`);
        for (const [filePath, saveFn] of pendingSaves) {
            try {
                saveFn();
                Logger.success(`[SHUTDOWN] Sauvegardé avec succès : ${filePath}`);
            } catch (err) {
                Logger.error(`[SHUTDOWN] Échec de sauvegarde pour ${filePath} :`, err);
            }
        }
        pendingSaves.clear();
    }
};

module.exports = ModelRegistry;
