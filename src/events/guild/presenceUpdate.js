'use strict';

const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const SupportRole = require('../../services/supportRoleService');

module.exports = {
    name: 'presenceUpdate',
    async run(client, oldPresence, newPresence) {
        const guild = newPresence?.guild || oldPresence?.guild;
        if (!guild) return;
        await SupportRole.onPresence(client, newPresence);
        scheduleStatsUpdate(client, guild, 'presence', 45_000);
    },
};
