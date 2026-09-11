'use strict';

const Helpers = require('./helpers');

async function resolveLeashTarget(message, args) {
    // 1) Mention explicite ou ID Discord (gérés tous les deux par resolveMember).
    if (args[0]) {
        return Helpers.resolveMember(message.guild, args[0]);
    }

    // 2) Réponse à un message : l'auteur du message auquel on répond devient la cible.
    const refId = message.reference?.messageId;
    if (refId) {
        const refMsg = await message.channel.messages.fetch(refId).catch(() => null);
        const authorId = refMsg?.author?.id;
        if (authorId) {
            const target = await Helpers.resolveMember(message.guild, authorId);
            if (target) return target;
        }
    }

    // 3) Aucune cible détectée.
    return null;
}

module.exports = {
    resolveLeashTarget,
};
