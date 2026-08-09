'use strict';

const { execSync } = require('child_process');
const EmbedHelper = require('../../utils/embedBuilder');
const Logger = require('../../utils/logger');

module.exports = {
    name: 'updatebot',
    category: 'owners',
    ownerOnly: true,
    aliases: ['botupdate'],
    description: 'Vérifie et installe les mises à jour disponibles depuis Git',
    usage: '[check|install]',
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'autoupdate' || sub === 'auto') {
            client.autoUpdate = !client.autoUpdate;
            return message.channel.send({ embeds: [EmbedHelper.success(`Mise à jour automatique ${client.autoUpdate ? 'activée' : 'désactivée'}.`)] });
        }

        try {
            const statusMsg = await message.channel.send({ embeds: [EmbedHelper.info('🔄 Vérification...', 'Vérification des mises à jour...', { color: 0x5865F2 })] });

            execSync('git fetch origin', { timeout: 15000, cwd: process.cwd() });
            const log = execSync('git log HEAD..origin/main --oneline', { timeout: 10000, cwd: process.cwd() }).toString().trim();

            if (!log) {
                return statusMsg.edit({ embeds: [EmbedHelper.success(`✅ Le bot est à jour (v${client.version}).`)] });
            }

            if (sub === 'install') {
                execSync('git pull origin main', { timeout: 30000, cwd: process.cwd() });
                Logger.warn('[UPDATE] Mise à jour installée, redémarrage requis.');
                return statusMsg.edit({ embeds: [EmbedHelper.warning(`🔄 Mise à jour installée. Redémarrez le bot pour appliquer les changements.\n\`\`\`${log}\`\`\``)] });
            }

            const commits = log.split('\n').slice(0, 10);
            return statusMsg.edit({ embeds: [EmbedHelper.info('📦 Mises à jour disponibles', [
                `${commits.length} nouveau(x) commit(s) :`,
                '```',
                ...commits,
                '```',
                'Utilisez `+updatebot install` pour installer.',
            ].join('\n'), { color: 0xF39C12 })] });

        } catch (error) {
            message.channel.send({ embeds: [EmbedHelper.error(`Impossible de vérifier les mises à jour: ${error.message}`)] });
        }
    },
};
