'use strict';

const pending = new Map();

// Serialise les operations visant le meme objet, sans bloquer les autres.
async function withKey(key, operation) {
    const previous = pending.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    pending.set(key, current);
    try {
        return await current;
    } finally {
        if (pending.get(key) === current) pending.delete(key);
    }
}

module.exports = { withKey };
