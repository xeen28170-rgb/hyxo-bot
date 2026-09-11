'use strict';

const Reminder = require('../../models/Reminder');
const Helpers = require('../../utils/helpers');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'remind',
    category: 'utility',
    description: 'Se faire envoyer un rappel.',
    usage: '-remind <temps> <message>',
    cooldown: 5,
    async run(client, message, args) {
        const timeStr = args[0];
        const msg = args.slice(1).join(' ');

        if (!timeStr || !msg) {
            const prefix = message.guildSettings?.prefix || client.prefix;
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${prefix}remind <temps> <message>\``)] });
        }

        const duration = Helpers.parseDuration(timeStr);
        if (!duration) return message.channel.send({ embeds: [EmbedHelper.error(message.t('general.invalid_duration'))] });

        const remindAt = new Date(Date.now() + duration);

        await Reminder.create({
            userId: message.author.id,
            guildId: message.guild.id,
            channelId: message.channel.id,
            message: msg,
            remindAt
        });

        message.channel.send({ embeds: [EmbedHelper.success(message.t('reminder.set', { time: Helpers.discordTimestamp(remindAt, 'R') }))] });
    },
};
