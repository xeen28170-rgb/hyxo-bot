'use strict';

const { randomUUID } = require('node:crypto');
const EmbedHelper = require('./embedBuilder');
const { disabledRows } = require('./menuLifetime');
const pending = new Set();
const controls = new Map();
const MASS = new Set(['massiverole', 'unmassiverole', 'unbanall', 'unmuteall', 'unprisonall', 'unlaisseall', 'lockall', 'unlockall', 'hideall', 'unhideall', 'global-lock', 'bringall', 'voicemove', 'clearowners', 'clearcustoms', 'unblall', 'renew', 'cleanup', 'clear']);

function needsConfirmation(command, args) {
    if (MASS.has(command.name)) return true;
    const sub = args[0]?.toLowerCase();
    return (['ban', 'kick', 'derank', 'delowner'].includes(command.name) && Boolean(args[0]))
        || (command.name === 'owner' && (['remove', 'del'].includes(sub) || (sub === 'global' && ['remove', 'del'].includes(args[1]?.toLowerCase()))))
        || (command.name === 'custom' && sub === 'del')
        || (command.name === 'tempvoc' && sub === 'delete')
        || (['ticket', 'ticket-manage'].includes(command.name) && sub === 'close')
        || (command.name === 'prison' && sub === 'disable')
        || (command.name === 'reset' && ['all', 'server'].includes(sub))
        || (command.name === 'backup' && ['restore', 'delete'].includes(sub))
        || (command.name === 'server-action' && sub === 'leave')
        || (command.name === 'updatebot' && sub === 'install')
        || (command.name === 'sync' && sub === 'all');
}

async function confirmCommand(message, command, args, prefix) {
    const key = `${message.guild.id}:${message.author.id}`;
    if (pending.has(key)) {
        await message.channel.send({ embeds: [EmbedHelper.warning('Une confirmation vous attend déjà. Confirmez-la ou annulez-la avant de recommencer.')] });
        return false;
    }
    pending.add(key);
    const id = 'confirm:' + randomUUID();
    try {
        const rows = [EmbedHelper.confirmButtons(id + ':yes', id + ':no')];
        const text = `${prefix}${command.name} ${args.join(' ')}`.replace(/`/g, '').slice(0, 900);
        const prompt = await message.channel.send({
            embeds: [EmbedHelper.info('Confirmer cette action ?', `**${command.description}**\n\n\`${text}\`\n\nServeur : **${message.guild.name}**\nCette action peut toucher plusieurs éléments ou supprimer des données.`, { color: EmbedHelper.Colors.WARNING, footer: 'Confirmation valable 60 secondes.' })],
            components: rows, allowedMentions: { parse: [] },
        });
        controls.set(id, message.author.id);
        let choice;
        try {
            choice = await prompt.awaitMessageComponent({ time: 60_000, filter: interaction => interaction.user.id === message.author.id && [id + ':yes', id + ':no'].includes(interaction.customId) });
        } catch {
            await prompt.edit({ embeds: [EmbedHelper.warning('Confirmation expirée. Rien n’a été exécuté.')], components: disabledRows(rows) }).catch(() => {});
            return false;
        }
        const confirmed = choice.customId === id + ':yes';
        await choice.update({ embeds: [EmbedHelper.info(confirmed ? 'Confirmation reçue' : 'Action annulée', confirmed ? 'Je vérifie à nouveau vos permissions avant de lancer l’action.' : 'Rien n’a été modifié.')], components: disabledRows(rows) });
        return confirmed;
    } finally {
        controls.delete(id);
        pending.delete(key);
    }
}

function isActiveConfirmation(customId, userId) {
    return controls.get(customId.split(':').slice(0, 2).join(':')) === userId;
}

async function confirmInteraction(interaction, description) {
    return confirmCommand({
        author: interaction.user, guild: interaction.guild,
        channel: { send: async payload => {
            if (interaction.replied || interaction.deferred) return interaction.followUp({ ...payload, flags: 64 });
            await interaction.reply({ ...payload, flags: 64 });
            return interaction.fetchReply();
        } },
    }, { name: 'confirmation', description }, [], '');
}

module.exports = { needsConfirmation, confirmCommand, isActiveConfirmation, confirmInteraction };
