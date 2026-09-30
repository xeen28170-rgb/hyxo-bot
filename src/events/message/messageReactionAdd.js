'use strict';

const { matchesReaction } = require('../../config/emojis');

const GiveawayService = require('../../services/giveawayService');

module.exports = {
    name: 'messageReactionAdd',
    async run(client, reaction, user) {
        if (!matchesReaction(reaction.emoji, 'GIVEAWAY') || user?.bot) return;
        await GiveawayService.scheduleRefresh(client, reaction.message);
    },
};
