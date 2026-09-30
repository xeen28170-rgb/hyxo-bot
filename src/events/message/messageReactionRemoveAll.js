'use strict';

const GiveawayService = require('../../services/giveawayService');
module.exports = {
    name: 'messageReactionRemoveAll',
    async run(client, message) { await GiveawayService.scheduleRefresh(client, message); },
};
