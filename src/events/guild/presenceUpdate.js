'use strict';

const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');

module.exports = {
    name: 'presenceUpdate',
    async run(client, oldPresence, newPresence) {
        const guild = newPresence?.guild || oldPresence?.guild;
        if (!guild) return;
        scheduleStatsUpdate(client, guild, 'presence', 45_000);
    },
};
