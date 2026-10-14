'use strict';

const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
    ModalBuilder, RoleSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');
const { DEFAULTS, buildMessage } = require('../../services/boostMessageService');

const PANEL_TTL = 10 * 60 * 1000;
const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// ─── Panneau ─────────────────────────────────────────────────────

function render(guild, settings, notice) {
    const config = settings.boostMessage || {};
    const logChannel = settings.logs?.boostLogs;
    const embed = EmbedHelper.info('Panneau Boost', [
        `**Messages de boost** : ${config.enabled ? 'activés' : 'désactivés'}`,
        `**Salon des messages** : ${config.channel ? `<#${config.channel}>` : 'non défini'}`,
        `**Rôle des boosters** : ${config.role ? `<@&${config.role}>` : 'aucun'}`,
        `**Salon des logs de boost** : ${logChannel ? `<#${logChannel}>` : 'aucun'}`,
        `**Boosts du serveur** : ${guild.premiumSubscriptionCount || 0} (niveau ${guild.premiumTier || 0})`,
    ].join('\n'), {
        color: 0xF47FFF,
        fields: [
            { name: 'Quand quelqu\'un boost', value: (config.message || `${DEFAULTS.boost} *(par défaut)*`).slice(0, 1024) },
            { name: 'Quand quelqu\'un arrête', value: config.unboostEnabled === false ? '*Rien n\'est envoyé*' : (config.unboostMessage || `${DEFAULTS.unboost} *(par défaut)*`).slice(0, 1024) },
            ...(notice ? [{ name: 'Dernière action', value: notice.slice(0, 1024) }] : []),
        ],
        footer: 'Variables : {user} (mention sans ping) {name} (pseudo) {server} {boosts} · Le panneau se ferme après 10 minutes',
    });
    return embed;
}

function rows(id, settings, disabled = false) {
    const config = settings.boostMessage || {};
    const button = (key, label, style = ButtonStyle.Secondary) => new ButtonBuilder()
        .setCustomId(`${id}:${key}`).setLabel(label).setStyle(style).setDisabled(disabled);
    return [
        new ActionRowBuilder().addComponents(
            button('toggle', config.enabled ? 'Désactiver' : 'Activer', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            button('message', 'Message de boost', ButtonStyle.Primary),
            button('unboost', 'Message de fin', ButtonStyle.Primary),
            button('unboostToggle', config.unboostEnabled === false ? 'Fin de boost : coupée' : 'Fin de boost : active'),
        ),
        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`${id}:channel`).setPlaceholder('Salon des messages de boost')
                .setChannelTypes(...TEXT_CHANNELS).setMinValues(1).setMaxValues(1).setDisabled(disabled),
        ),
        new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder().setCustomId(`${id}:role`).setPlaceholder('Rôle donné aux boosters (retiré à la fin du boost)')
                .setMinValues(0).setMaxValues(1).setDisabled(disabled),
        ),
        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`${id}:logs`).setPlaceholder('Salon des logs de boost')
                .setChannelTypes(...TEXT_CHANNELS).setMinValues(0).setMaxValues(1).setDisabled(disabled),
        ),
        new ActionRowBuilder().addComponents(
            button('preview', 'Aperçu'),
            button('resetRole', 'Retirer le rôle booster'),
            button('close', 'Fermer'),
        ),
    ];
}

function modal(id, kind, config) {
    const current = kind === 'message' ? config.message : config.unboostMessage;
    const input = new TextInputBuilder()
        .setCustomId('value')
        .setLabel(kind === 'message' ? 'Message quand quelqu\'un boost' : 'Message quand quelqu\'un arrête')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1500)
        .setPlaceholder('Vide = message par défaut. Variables : {user} {name} {server} {boosts}');
    if (current) input.setValue(current);
    return new ModalBuilder()
        .setCustomId(`${id}:modal:${kind}`)
        .setTitle(kind === 'message' ? 'Message de boost' : 'Message de fin de boost')
        .addComponents(new ActionRowBuilder().addComponents(input));
}

async function openPanel(client, message) {
    const guildId = message.guild.id;
    const id = `boostp:${message.id}`;
    let settings = await getGuildSettings(client, guildId);
    const save = async updates => {
        await Guild.updateOne({ guildId }, updates);
        invalidateGuildSettings(client, guildId);
        settings = await getGuildSettings(client, guildId);
    };
    const panel = await message.channel.send({ embeds: [render(message.guild, settings)], components: rows(id, settings), allowedMentions: { parse: [] } });

    const collector = panel.createMessageComponentCollector({ time: PANEL_TTL });
    collector.on('collect', async interaction => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: 'Seule la personne qui a ouvert ce panneau peut l\'utiliser.', flags: 64 }).catch(() => {});
        }
        const key = interaction.customId.slice(id.length + 1);
        const refresh = notice => ({ embeds: [render(message.guild, settings, notice)], components: rows(id, settings) });
        try {
            if (key === 'close') {
                collector.stop('close');
                return interaction.update({ embeds: [render(message.guild, settings, 'Panneau fermé.')], components: rows(id, settings, true) });
            }
            if (key === 'toggle') {
                const enabled = !settings.boostMessage?.enabled;
                if (enabled && !settings.boostMessage?.channel) {
                    return interaction.update(refresh('Choisis d\'abord le salon des messages dans le menu.'));
                }
                await save({ 'boostMessage.enabled': enabled });
                return interaction.update(refresh(`Messages de boost ${enabled ? 'activés' : 'désactivés'}.`));
            }
            if (key === 'unboostToggle') {
                const enabled = settings.boostMessage?.unboostEnabled === false;
                await save({ 'boostMessage.unboostEnabled': enabled });
                return interaction.update(refresh(`Message de fin de boost ${enabled ? 'activé' : 'coupé'}.`));
            }
            if (key === 'channel' && interaction.isChannelSelectMenu()) {
                const channelId = interaction.values[0];
                await save({ 'boostMessage.channel': channelId, 'boostMessage.enabled': true });
                return interaction.update(refresh(`Les messages de boost seront envoyés dans <#${channelId}>. Ils sont activés.`));
            }
            if (key === 'logs' && interaction.isChannelSelectMenu()) {
                const channelId = interaction.values[0] || null;
                await save(channelId ? { 'logs.boostLogs': channelId, 'logs.enabled': true } : { 'logs.boostLogs': null });
                return interaction.update(refresh(channelId ? `Logs de boost envoyés dans <#${channelId}>.` : 'Logs de boost désactivés.'));
            }
            if ((key === 'role' && interaction.isRoleSelectMenu()) || key === 'resetRole') {
                const role = key === 'role' ? interaction.roles.first() : null;
                if (role && (role.managed || role.id === message.guild.id)) {
                    return interaction.update(refresh('Ce rôle ne peut pas être donné par le bot (rôle géré par Discord ou @everyone).'));
                }
                if (role && role.position >= message.guild.members.me.roles.highest.position) {
                    return interaction.update(refresh(`Le rôle ${role} est au-dessus du mien : place mon rôle plus haut pour que je puisse le donner.`));
                }
                await save({ 'boostMessage.role': role?.id || null });
                return interaction.update(refresh(role ? `Les boosters recevront le rôle ${role}.` : 'Aucun rôle n\'est donné aux boosters.'));
            }
            if (key === 'preview') {
                const config = settings.boostMessage || {};
                const lines = [`**Boost :** ${buildMessage(config, 'boost', message.member).content}`];
                if (config.unboostEnabled !== false) lines.push(`**Fin de boost :** ${buildMessage(config, 'unboost', message.member).content}`);
                return interaction.reply({ content: lines.join('\n\n').slice(0, 2000), flags: 64, allowedMentions: { parse: [] }, raw: true });
            }
            if (key === 'message' || key === 'unboost') {
                await interaction.showModal(modal(id, key, settings.boostMessage || {}));
                const submitted = await interaction.awaitModalSubmit({
                    time: 5 * 60 * 1000,
                    filter: i => i.customId === `${id}:modal:${key}` && i.user.id === message.author.id,
                }).catch(() => null);
                if (!submitted) return;
                const value = submitted.fields.getTextInputValue('value').trim() || null;
                await save(key === 'message' ? { 'boostMessage.message': value } : { 'boostMessage.unboostMessage': value, 'boostMessage.unboostEnabled': true });
                await submitted.deferUpdate();
                return panel.edit(refresh(value ? 'Message enregistré.' : 'Message remis par défaut.'));
            }
        } catch (error) {
            if (error?.code === 10062 || error?.code === 40060) return;
            const notice = { content: `Action impossible : ${error.message}`, flags: 64 };
            if (interaction.deferred || interaction.replied) await interaction.followUp(notice).catch(() => {});
            else await interaction.reply(notice).catch(() => {});
        }
    });
    collector.on('end', (_, reason) => {
        if (reason !== 'close') panel.edit({ components: rows(id, settings, true) }).catch(() => {});
    });
}

// ─── Commande ────────────────────────────────────────────────────

module.exports = {
    name: 'boostmsg',
    aliases: ['boostmessage', 'boost-message', 'boost-settings', 'boostpanel'],
    category: 'config',
    description: 'Panneau boost : messages de boost et de fin de boost, rôle des boosters, logs de boost',
    usage: '[on/off | salon #salon | message <texte> | unboost <texte/on/off> | role @rôle/off | test]',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const guildId = message.guild.id;
        const prefix = message.guildSettings?.prefix || client.prefix;
        const sub = args[0]?.toLowerCase();
        const text = args.slice(1).join(' ').trim();
        const save = async (updates, done) => {
            await Guild.updateOne({ guildId }, updates);
            invalidateGuildSettings(client, guildId);
            return message.channel.send({ embeds: [EmbedHelper.success(done)] });
        };

        // Sans argument : le panneau, qui règle tout.
        if (!sub) return openPanel(client, message);

        if (sub === 'on' || sub === 'off') {
            const settings = await getGuildSettings(client, guildId);
            if (sub === 'on' && !settings.boostMessage?.channel) {
                return message.channel.send({ embeds: [EmbedHelper.error(`Choisis d'abord le salon : \`${prefix}boostmsg salon #salon\`.`)] });
            }
            return save({ 'boostMessage.enabled': sub === 'on' }, `Messages de boost **${sub === 'on' ? 'activés' : 'désactivés'}**.`);
        }

        if (sub === 'salon' || sub === 'channel') {
            const channel = Helpers.resolveChannel(message.guild, args[1]) || message.mentions.channels.first();
            if (!channel?.isTextBased?.()) return message.channel.send({ embeds: [EmbedHelper.error('Mentionne un salon textuel, par exemple `#boosts`.')] });
            return save({ 'boostMessage.channel': channel.id, 'boostMessage.enabled': true }, `Les messages de boost seront envoyés dans ${channel}. Ils sont activés.`);
        }

        if (sub === 'message') {
            if (!text) return message.channel.send({ embeds: [EmbedHelper.error(`Écris le message : \`${prefix}boostmsg message Merci {user} pour le boost !\``)] });
            if (text.toLowerCase() === 'reset') return save({ 'boostMessage.message': null }, 'Message de boost remis par défaut.');
            return save({ 'boostMessage.message': text }, 'Message de boost enregistré.');
        }

        if (sub === 'unboost') {
            const choice = text.toLowerCase();
            if (!text) return message.channel.send({ embeds: [EmbedHelper.error(`Écris le message, ou \`${prefix}boostmsg unboost off\` pour ne rien envoyer.`)] });
            if (choice === 'off' || choice === 'on') return save({ 'boostMessage.unboostEnabled': choice === 'on' }, `Message de fin de boost **${choice === 'on' ? 'activé' : 'coupé'}**.`);
            if (choice === 'reset') return save({ 'boostMessage.unboostMessage': null, 'boostMessage.unboostEnabled': true }, 'Message de fin de boost remis par défaut.');
            return save({ 'boostMessage.unboostMessage': text, 'boostMessage.unboostEnabled': true }, 'Message de fin de boost enregistré.');
        }

        if (sub === 'role') {
            if (text.toLowerCase() === 'off') return save({ 'boostMessage.role': null }, 'Aucun rôle n\'est donné aux boosters.');
            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
            if (!role || role.managed) return message.channel.send({ embeds: [EmbedHelper.error(`Mentionne un rôle : \`${prefix}boostmsg role @Booster\`, ou \`off\`.`)] });
            return save({ 'boostMessage.role': role.id }, `Les boosters recevront le rôle ${role}.`);
        }

        if (sub === 'test') {
            // Aperçu dans ce salon, sans notifier personne.
            const config = (await getGuildSettings(client, guildId)).boostMessage || {};
            await message.channel.send(buildMessage(config, 'boost', message.member));
            if (config.unboostEnabled !== false) await message.channel.send(buildMessage(config, 'unboost', message.member));
            return;
        }

        return openPanel(client, message);
    },
};
