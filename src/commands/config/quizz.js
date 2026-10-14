'use strict';

const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, StringSelectMenuBuilder,
} = require('discord.js');
const Guild = require('../../models/Guild');
const QuizScore = require('../../models/QuizScore');
const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');
const QuizService = require('../../services/quizService');

const PANEL_TTL = 10 * 60 * 1000;
const INTERVALS = [1, 2, 3, 5, 10, 15, 30, 60];
const DURATIONS = [30, 45, 60, 90, 120];

// Les 24 premiers thèmes dans le premier menu (avec « Tous »), le reste dans le second.
const themeGroups = () => [QuizService.THEME_KEYS.slice(0, 24), QuizService.THEME_KEYS.slice(24, 49)];

const themeNames = themes => (themes?.length
    ? themes.filter(key => QuizService.THEMES[key]).map(key => QuizService.THEMES[key].label).join(', ')
    : 'Tous les thèmes');

async function leaderboard(guild, userId) {
    const top = await QuizScore.top(guild.id, 10);
    const lines = top.length
        ? top.map((doc, i) => `**${i + 1}.** <@${doc.userId}> · ${doc.points} point${doc.points > 1 ? 's' : ''}`)
        : ['Personne n\'a encore de point. Le premier qui trouve une bonne réponse ouvre le classement.'];
    const mine = userId ? await QuizScore.rank(guild.id, userId) : null;
    return EmbedHelper.info('Classement du quiz', lines.join('\n'), {
        color: 0x5865F2,
        footer: mine ? `Ta place : ${mine.position}/${mine.total} avec ${mine.points} point(s)` : undefined,
    });
}

function render(guild, settings, notice) {
    const quiz = QuizService.config(settings);
    const questions = (quiz.themes?.length ? quiz.themes : QuizService.THEME_KEYS)
        .reduce((total, key) => total + (QuizService.THEMES[key]?.questions.length || 0), 0);
    return EmbedHelper.info('Panneau Quiz', [
        `**Statut** : ${quiz.enabled ? 'activé' : 'désactivé'}`,
        `**Salon** : ${quiz.channel ? `<#${quiz.channel}>` : 'non défini'}`,
        `**Thèmes** : ${themeNames(quiz.themes)} (${questions} questions)`,
        `**Une question toutes les** : ${quiz.interval} minute${quiz.interval > 1 ? 's' : ''}`,
        `**Temps pour répondre** : ${quiz.duration} secondes`,
        '',
        'Les membres répondent en écrivant la lettre **A**, **B**, **C** ou **D**. Le premier qui trouve gagne 1 point.',
        ...(notice ? ['', `**Dernière action** : ${notice}`] : []),
    ].join('\n'), { color: 0x5865F2, footer: 'Le panneau se ferme après 10 minutes' });
}

function rows(id, settings, disabled = false) {
    const quiz = QuizService.config(settings);
    const button = (key, label, style = ButtonStyle.Secondary) => new ButtonBuilder()
        .setCustomId(`${id}:${key}`).setLabel(label).setStyle(style).setDisabled(disabled);
    // Discord limite un menu à 25 choix : les thèmes sont répartis sur deux menus.
    const option = key => ({
        label: QuizService.THEMES[key].label,
        description: `${QuizService.THEMES[key].questions.length} questions`,
        value: key,
        default: Boolean(quiz.themes?.includes(key)),
    });
    const [firstKeys, secondKeys] = themeGroups();
    const themeMenu = (key, placeholder, options) => new StringSelectMenuBuilder().setCustomId(`${id}:${key}`)
        .setPlaceholder(placeholder).setMinValues(1).setMaxValues(options.length).addOptions(options).setDisabled(disabled);
    return [
        new ActionRowBuilder().addComponents(
            button('toggle', quiz.enabled ? 'Désactiver' : 'Activer', quiz.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            button('now', 'Poser une question', ButtonStyle.Primary),
            button('top', 'Classement'),
            button('reset', 'Remettre le classement à zéro', ButtonStyle.Danger),
            button('close', 'Fermer'),
        ),
        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`${id}:channel`).setPlaceholder('Salon du quiz')
                .setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1).setDisabled(disabled),
        ),
        new ActionRowBuilder().addComponents(themeMenu('themes1', 'Thèmes (un, plusieurs ou tous)', [
            { label: 'Tous les thèmes', value: 'all', description: 'Mélange de tous les thèmes', default: !quiz.themes?.length },
            ...firstKeys.map(option),
        ])),
        new ActionRowBuilder().addComponents(themeMenu('themes2', 'Autres thèmes', secondKeys.map(option))),
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId(`${id}:rythm`).setPlaceholder('Fréquence et temps de réponse')
                .addOptions([
                    // Aucune option pré-cochée : le menu n'accepte qu'un choix, les réglages actuels sont
                    // affichés dans le panneau (Discord refuse deux valeurs cochées sur un choix unique).
                    ...INTERVALS.map(m => ({ label: `Une question toutes les ${m} min`, value: `interval:${m}`, description: Number(quiz.interval) === m ? 'Réglage actuel' : undefined })),
                    ...DURATIONS.map(s => ({ label: `${s} secondes pour répondre`, value: `duration:${s}`, description: Number(quiz.duration) === s ? 'Réglage actuel' : undefined })),
                ])
                .setDisabled(disabled),
        ),
    ];
}

async function openPanel(client, message) {
    const guildId = message.guild.id;
    const id = `quizp:${message.id}`;
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
                const enabled = !QuizService.config(settings).enabled;
                if (enabled && !settings.quiz?.channel) return interaction.update(refresh('Choisis d\'abord le salon du quiz dans le menu.'));
                await save({ 'quiz.enabled': enabled });
                if (!enabled) QuizService.stop(guildId);
                return interaction.update(refresh(enabled ? `Quiz activé : une question toutes les ${QuizService.config(settings).interval} minute(s).` : 'Quiz désactivé.'));
            }
            if (key === 'channel' && interaction.isChannelSelectMenu()) {
                await save({ 'quiz.channel': interaction.values[0] });
                return interaction.update(refresh(`Les questions seront posées dans <#${interaction.values[0]}>.`));
            }
            if ((key === 'themes1' || key === 'themes2') && interaction.isStringSelectMenu()) {
                // Chaque menu remplace sa propre partie de la sélection ; « Tous » vide le filtre.
                const [firstKeys, secondKeys] = themeGroups();
                const current = QuizService.config(settings).themes || [];
                const keep = current.filter(k => (key === 'themes1' ? secondKeys : firstKeys).includes(k));
                const themes = interaction.values.includes('all') ? [] : [...new Set([...keep, ...interaction.values])];
                await save({ 'quiz.themes': themes });
                return interaction.update(refresh(`Thèmes : ${themeNames(themes)}.`));
            }
            if (key === 'rythm' && interaction.isStringSelectMenu()) {
                const [kind, value] = interaction.values[0].split(':');
                await save({ [`quiz.${kind}`]: Number(value) });
                return interaction.update(refresh(kind === 'interval' ? `Une question toutes les ${value} minute(s).` : `${value} secondes pour répondre.`));
            }
            if (key === 'top') {
                return interaction.reply({ embeds: [await leaderboard(message.guild, interaction.user.id)], flags: 64, allowedMentions: { parse: [] } });
            }
            if (key === 'now') {
                if (!settings.quiz?.channel) return interaction.update(refresh('Choisis d\'abord le salon du quiz dans le menu.'));
                const asked = await QuizService.ask(client, message.guild, settings, { force: true });
                return interaction.update(refresh(asked ? `Question posée dans <#${settings.quiz.channel}>.` : 'Une question est déjà en cours, attends la réponse.'));
            }
            if (key === 'reset') {
                const { confirmInteraction } = require('../../utils/commandConfirmation');
                if (!await confirmInteraction(interaction, 'Remettre à zéro le classement du quiz')) return;
                await QuizScore.reset(guildId);
                return panel.edit(refresh('Classement remis à zéro.'));
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

module.exports = {
    name: 'quizz',
    aliases: ['quiz'],
    category: 'config',
    description: 'Quiz automatique dans un salon : thèmes au choix, réponses A/B/C/D, classement',
    usage: '[on/off | salon #salon | top]',
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        // Le classement est ouvert à tous ; le réglage demande « Gérer le serveur ».
        if (['top', 'classement', 'leaderboard'].includes(sub)) {
            return message.channel.send({ embeds: [await leaderboard(message.guild, message.author.id)], allowedMentions: { parse: [] } });
        }
        if (!message.member.permissions.has('ManageGuild')) {
            return message.channel.send({ embeds: [EmbedHelper.error('Il faut la permission « Gérer le serveur » pour régler le quiz. Classement : `+quizz top`.')] });
        }
        const guildId = message.guild.id;
        const save = async (updates, done) => {
            await Guild.updateOne({ guildId }, updates);
            invalidateGuildSettings(client, guildId);
            return message.channel.send({ embeds: [EmbedHelper.success(done)] });
        };
        if (sub === 'on' || sub === 'off') {
            const settings = await getGuildSettings(client, guildId);
            if (sub === 'on' && !settings.quiz?.channel) return message.channel.send({ embeds: [EmbedHelper.error('Choisis d\'abord le salon : `+quizz salon #salon`, ou ouvre le panneau avec `+quizz`.')] });
            if (sub === 'off') QuizService.stop(guildId);
            return save({ 'quiz.enabled': sub === 'on' }, `Quiz **${sub === 'on' ? 'activé' : 'désactivé'}**.`);
        }
        if (sub === 'salon' || sub === 'channel') {
            const channel = Helpers.resolveChannel(message.guild, args[1]) || message.mentions.channels.first();
            if (!channel?.isTextBased?.()) return message.channel.send({ embeds: [EmbedHelper.error('Mentionne un salon textuel, par exemple `#quiz`.')] });
            return save({ 'quiz.channel': channel.id }, `Les questions seront posées dans ${channel}.`);
        }
        return openPanel(client, message);
    },
};
