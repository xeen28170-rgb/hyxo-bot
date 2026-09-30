'use strict';

const BackupService = require('../../services/backupService');
const Backup = require('../../models/Backup');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'backup',
    category: 'backup',
    ownerOnly: false,
    description: 'Gérer les backups du serveur.',
    usage: '-backup <create|restore|list|delete> [id]',
    permissions: ['Administrator'],
    cooldown: 10,
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        if (sub === 'delete') {
            if (!args[1]) return message.channel.send({ embeds: [EmbedHelper.error('ID manquant.')] });
            const removed = await Backup.findOneAndDelete({ backupId: args[1], guildId: message.guild.id });
            return message.channel.send({ embeds: [removed ? EmbedHelper.success('Sauvegarde supprimee.') : EmbedHelper.error('Sauvegarde introuvable.')] });
        }

        if (sub === 'create') {
            const backup = await BackupService.create(message.guild, message.author.id);
            return message.channel.send({ embeds: [EmbedHelper.success(`Sauvegarde créée avec l'ID : \`${backup.backupId}\``)] });
        }

        if (sub === 'restore') {
            const id = args[1];
            if (!id) return message.channel.send({ embeds: [EmbedHelper.error('ID manquant.')] });

            const backup = await Backup.findOne({ backupId: id, guildId: message.guild.id });
            if (!backup) return message.channel.send({ embeds: [EmbedHelper.error('Sauvegarde introuvable.')] });

            await message.channel.send({ embeds: [EmbedHelper.info('📥 Restauration...', 'Restauration en cours, merci de patienter.')] });
            const report = await BackupService.restore(message.guild, id);
            if (!report) return message.channel.send({ embeds: [EmbedHelper.error('Sauvegarde introuvable.')] });

            const lines = [
                `**Rôles :** ${report.roles.filter(r => r.status === 'created').length} créés, ${report.roles.filter(r => r.status === 'duplicate').length} déjà présents, ${report.roles.filter(r => r.status === 'failed').length} en échec`,
                `**Salons :** ${report.channels.filter(c => c.status === 'created').length} créés, ${report.channels.filter(c => c.status === 'duplicate').length} déjà présents, ${report.channels.filter(c => c.status === 'failed').length} en échec`,
            ];
            lines.push(`Elements restaures : ${report.restored}. Echecs : ${report.failed}.`);
            if (report.failed > 0) lines.push('Restauration partielle : configuration conservee. ' + report.errors.slice(0, 3).join('\n'));
            return message.channel.send({ embeds: [EmbedHelper.info('Bilan de restauration', lines.join('\n').slice(0, 4000))] });
        }

        if (sub === 'list') {
            const backups = await Backup.find({ guildId: message.guild.id });
            const embed = EmbedHelper.info('📥 Backups du serveur', backups.map(b => `\`${b.backupId}\` - ${Helpers.formatDate(b.createdAt)}`).join('\n') || 'Aucune sauvegarde.');
            return message.channel.send({ embeds: [embed] });
        }

        return message.channel.send({ embeds: [EmbedHelper.info('📥 Backups — Aide', '`-backup create`\n`-backup restore <id>`\n`-backup list`')] });
    },
};

