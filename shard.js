'use strict';

require('dotenv').config();

const { ShardingManager } = require('discord.js');

const totalShards = process.env.TOTAL_SHARDS
    ? Math.max(1, parseInt(process.env.TOTAL_SHARDS, 10) || 1)
    : 'auto';

const manager = new ShardingManager('./index.js', {
    totalShards,
    token: process.env.TOKEN,
    respawn: true,
});

manager.on('shardCreate', (shard) => {
    const label = totalShards === 'auto' ? 'auto' : String(totalShards);
    console.log(`[SHARD] Lancement du shard ${shard.id + 1}/${label}`);
});

manager.spawn({ timeout: 120000 })
    .then(() => console.log('[SHARD] Tous les shards sont connectés.'))
    .catch((err) => {
        console.error('[SHARD] Erreur lors du lancement des shards:', err);
        process.exit(1);
    });