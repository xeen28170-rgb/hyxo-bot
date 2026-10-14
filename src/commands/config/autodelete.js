'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'autodelete',
    category: 'config',
    description: 'Active/désactive la suppression automatique des commandes ou des réponses',
    usage: '<tout/moderation/snipe> <commande/reply> <on/off/durée>',
    permissions: ['Administrator'],
    async run(client, message, args) {
        // « tout » : toutes les commandes (actif par défaut, cf. messageAutomationService).
        const scope = ({ tout: 'all', toutes: 'all', all: 'all' })[args[0]?.toLowerCase()] || args[0]?.toLowerCase();
        const target = args[1]?.toLowerCase();
        const status = args[2]?.toLowerCase();

        if (!scope || !target || !status) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${this.usage}\``)] });
        }

        if (!['all', 'moderation', 'snipe'].includes(scope)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Type invalide. Utilisez `tout`, `moderation` ou `snipe`.')] });
        }

        if (!['commande', 'reply'].includes(target)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Cible invalide. Utilisez `commande` ou `reply`.')] });
        }

        const isOn = status === 'on';
        const isValidDuration = /^\d+[smhd]$/i.test(status);
        const isOff = status === 'off';

        if (!isOn && !isOff && !isValidDuration) {
            return message.channel.send({ embeds: [EmbedHelper.error('Statut invalide. Utilisez `on`, `off`, ou une durée (ex: `5s`, `1m`).')] });
        }

        const key = `autodelete.${scope}`;
        const settings = await getGuildSettings(client, message.guild.id);
        const previous = settings.autodelete?.[scope];
        const value = previous?.target ? { [previous.target]: { duration: previous.duration } } : { ...previous };
        value[target] = isOff ? null : { duration: isValidDuration ? status : null };
        if (scope === 'all' && !isOff && target === 'commande') value[target] = {};

        await Guild.updateOne({ guildId: message.guild.id }, { [key]: value });
        client.cache.invalidateGuild(message.guild.id);

        const label = scope === 'all' ? 'toutes les commandes' : scope;
        const msg = isOff
            ? `Autodelete **${label}** désactivé sur les ${target === 'commande' ? 'commandes' : 'réponses'}.`
            : `Autodelete **${label}** activé sur les ${target === 'commande' ? 'commandes' : 'réponses'}${isValidDuration ? ` (${status})` : ''}.`;

        message.channel.send({ embeds: [EmbedHelper.success(msg)] });
    },
};
