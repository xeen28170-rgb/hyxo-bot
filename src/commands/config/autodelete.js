'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'autodelete',
    category: 'config',
    description: 'Active/désactive la suppression automatique des commandes ou des réponses',
    usage: '<moderation/snipe> <commande/reply> <on/off/durée>',
    permissions: ['Administrator'],
    async run(client, message, args) {
        const scope = args[0]?.toLowerCase();
        const target = args[1]?.toLowerCase();
        const status = args[2]?.toLowerCase();

        if (!scope || !target || !status) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${this.usage}\``)] });
        }

        if (!['moderation', 'snipe'].includes(scope)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Type invalide. Utilisez `moderation` ou `snipe`.')] });
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

        await Guild.updateOne({ guildId: message.guild.id }, { [key]: value });
        client.cache.invalidateGuild(message.guild.id);

        const msg = isOff
            ? `Autodelete **${scope}** désactivé.`
            : `Autodelete **${scope}** activé sur les ${target === 'commande' ? 'commandes' : 'réponses'}${isValidDuration ? ` (${status})` : ''}.`;

        message.channel.send({ embeds: [EmbedHelper.success(msg)] });
    },
};
