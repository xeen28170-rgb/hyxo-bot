'use strict';

const BotSettings = require('../models/BotSettings');

module.exports = {
    async enforce(guild) {
        const settings = (await BotSettings.get()).securInvite;
        if (!settings?.enabled || settings.whitelist?.includes(guild.ownerId)) return false;
        await guild.leave();
        return true;
    },
};
