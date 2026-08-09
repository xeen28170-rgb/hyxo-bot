'use strict';

const Guild = require('../models/Guild');

async function getGuildSettings(client, guildId, options = {}) {
    const { create = true, useCache = true } = options;
    if (!guildId) return null;

    if (useCache && create && client.cache?.getGuildOrLoad) {
        return client.cache.getGuildOrLoad(guildId, () => Guild.getOrCreate(guildId));
    }

    if (useCache && client.cache?.getGuild) {
        const cached = client.cache.getGuild(guildId);
        if (cached) return cached;
    }

    const settings = create
        ? await Guild.getOrCreate(guildId)
        : await Guild.findOne({ guildId });

    if (settings && useCache && client.cache?.setGuild) {
        client.cache.setGuild(guildId, settings);
    }

    return settings;
}

function invalidateGuildSettings(client, guildId) {
    if (!guildId) return;
    client.cache?.invalidateGuild?.(guildId);
}

module.exports = {
    getGuildSettings,
    invalidateGuildSettings,
};
