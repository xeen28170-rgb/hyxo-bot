'use strict';

const Reminder = require('../models/Reminder');
const Logger = require('../utils/logger');
const EmbedHelper = require('../utils/embedBuilder');

const ReminderService = {
    async processReminders(client) {
        const now = new Date();
        const all = await Reminder.find({ active: true });
        const due = all.filter(r => r.remindAt <= now).slice(0, 20);

        for (const reminder of due) {
            try {
                const channel = client.channels.cache.get(reminder.channelId)
                    || await client.channels.fetch(reminder.channelId).catch(() => null);

                if (channel) {
                    const embed = EmbedHelper.info('⏰ Rappel!', reminder.message, { color: 0x5865F2 });
                    await channel.send({
                        content: `<@${reminder.userId}>`,
                        embeds: [embed],
                    }).catch(() => {});
                }

                if (reminder.recurring && reminder.recurringInterval) {
                    await Reminder.updateOne({ _id: reminder._id }, {
                        remindAt: new Date(Date.now() + reminder.recurringInterval),
                    });
                } else {
                    await Reminder.updateOne({ _id: reminder._id }, { active: false });
                }
            } catch (err) {
                Logger.error(`Erreur rappel ${reminder._id}:`, err);
                await Reminder.updateOne({ _id: reminder._id }, { active: false });
            }
        }
    },
};

module.exports = ReminderService;
