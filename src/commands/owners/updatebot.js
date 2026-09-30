'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const EmbedHelper = require('../../utils/embedBuilder');
const Logger = require('../../utils/logger');
let updating = false;

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

        if (updating) return message.channel.send({ embeds: [EmbedHelper.info('Mise à jour en cours', 'Une vérification ou une installation est déjà en cours.')] });
        updating = true;
        try {
            const statusMsg = await message.channel.send({ embeds: [EmbedHelper.info('🔄 Vérification...', 'Vérification des mises à jour...', { color: 0x5865F2 })] });

            await execFileAsync('git', ['fetch', 'origin'], { timeout: 15000, cwd: process.cwd(), windowsHide: true });
            const { stdout } = await execFileAsync('git', ['log', 'HEAD..origin/main', '--oneline'], { timeout: 10000, cwd: process.cwd(), windowsHide: true });
            const log = stdout.trim();

            if (!log) {
                return statusMsg.edit({ embeds: [EmbedHelper.success(`✅ Le bot est à jour (v${client.version}).`)] });
            }

            if (sub === 'install') {
                await execFileAsync('git', ['pull', 'origin', 'main'], { timeout: 30000, cwd: process.cwd(), windowsHide: true });
                Logger.warn('[UPDATE] Mise à jour installée, redémarrage requis.');
                return statusMsg.edit({ embeds: [EmbedHelper.warning(`🔄 Mise à jour installée. Redémarrez le bot pour appliquer les changements.\n\`\`\`${log}\`\`\``)] });
            }

            const commits = log.split('\n').slice(0, 10);
            const prefix = message.guildSettings?.prefix || client.prefix;
            return statusMsg.edit({ embeds: [EmbedHelper.info('📦 Mises à jour disponibles', [
                `${commits.length} nouveau(x) commit(s) :`,
                '```',
                ...commits,
                '```',
                `Utilisez \`${prefix}updatebot install\` pour installer.`,
            ].join('\n'), { color: 0xF39C12 })] });

        } catch (error) {
            await message.channel.send({ embeds: [EmbedHelper.error(`Impossible de vérifier les mises à jour: ${error.message}`)] });
        } finally {
            updating = false;
        }
    },
};
