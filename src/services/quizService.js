'use strict';

/**
 * Quiz automatique (+quizz) : toutes les X minutes, une question à 4 réponses (A, B, C, D)
 * est posée dans le salon choisi. Le premier qui écrit la bonne lettre gagne 1 point ;
 * chaque membre n'a qu'un essai par question. Sans bonne réponse à la fin du temps,
 * la solution est donnée. Les points font le classement (+quizz top).
 */

const EmbedHelper = require('../utils/embedBuilder');
const QuizScore = require('../models/QuizScore');
const Logger = require('../utils/logger');
const { getGuildSettings } = require('../utils/guildSettings');
const { THEMES, THEME_KEYS } = require('../config/quizQuestions');

const LETTERS = ['A', 'B', 'C', 'D'];
const TICK = 15_000;
const RECENT_LIMIT = 600;          // questions déjà posées, évitées tant que possible
const QUIZ_COLOR = 0x5865F2;

const active = new Map();          // guildId → question en cours
const lastAsked = new Map();       // guildId → horodatage de la dernière question
const recent = new Map();          // guildId → clés des dernières questions posées
let timer = null;

const config = settings => ({
    enabled: false, channel: null, themes: [], interval: 3, duration: 60,
    ...(settings?.quiz || {}),
});

function shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/**
 * Question au hasard dans les thèmes choisis (tous si aucun), en évitant les récentes.
 * Le thème est tiré d'abord, puis la question : les gros thèmes (calcul, pays…) ne
 * prennent pas toute la place quand tous les thèmes sont actifs.
 */
function pickQuestion(guildId, themes) {
    const chosen = (themes?.length ? themes : THEME_KEYS).filter(key => THEMES[key]);
    const keys = chosen.length ? chosen : THEME_KEYS;
    const seen = new Set(recent.get(guildId) || []);
    const theme = keys[Math.floor(Math.random() * keys.length)];
    const pool = THEMES[theme].questions.map((question, index) => ({ theme, index, question }));
    const fresh = pool.filter(item => !seen.has(`${item.theme}:${item.index}`));
    const list = fresh.length ? fresh : pool;
    const choice = list[Math.floor(Math.random() * list.length)];
    recent.set(guildId, [...(recent.get(guildId) || []), `${choice.theme}:${choice.index}`].slice(-RECENT_LIMIT));
    return choice;
}

async function ask(client, guild, settings, { force = false } = {}) {
    const quiz = config(settings);
    if (!quiz.channel || (!quiz.enabled && !force) || active.has(guild.id)) return false;
    const channel = guild.channels.cache.get(quiz.channel);
    if (!channel?.isTextBased?.()) return false;

    const { theme, question } = pickQuestion(guild.id, quiz.themes);
    const [text, correct, ...wrong] = question;
    const choices = shuffle([correct, ...wrong]);
    const answerIndex = choices.indexOf(correct);
    const duration = Math.min(Math.max(Number(quiz.duration) || 60, 15), 300);

    const embed = EmbedHelper.info(`Quiz · ${THEMES[theme].label}`, [
        `**${text}**`,
        '',
        ...choices.map((choice, i) => `**${LETTERS[i]}.** ${choice}`),
    ].join('\n'), { color: QUIZ_COLOR, footer: `Réponds avec la lettre A, B, C ou D · un seul essai · ${duration} s` });

    const message = await channel.send({ embeds: [embed] }).catch(error => {
        Logger.warn(`[Quiz] Question impossible dans ${guild.id}/${channel.id} : ${error.message}`);
        return null;
    });
    lastAsked.set(guild.id, Date.now());
    if (!message) return false;

    const round = {
        channelId: channel.id,
        letter: LETTERS[answerIndex],
        answer: correct,
        tried: new Set(),
        timeout: setTimeout(() => expire(guild.id, channel), duration * 1000),
    };
    round.timeout.unref?.();
    active.set(guild.id, round);
    return true;
}

async function expire(guildId, channel) {
    const round = active.get(guildId);
    if (!round) return;
    active.delete(guildId);
    await channel.send({
        embeds: [EmbedHelper.info('Temps écoulé', `Personne n'a trouvé. La bonne réponse était **${round.letter}. ${round.answer}**.`, { color: EmbedHelper.Colors.WARNING })],
    }).catch(() => {});
}

/** Réponse d'un membre (une lettre seule). Renvoie true si le message était une réponse au quiz. */
async function onMessage(message) {
    const round = active.get(message.guild?.id);
    if (!round || message.channelId !== round.channelId) return false;
    const match = /^\s*([abcd])\s*[).]?\s*$/i.exec(message.content || '');
    if (!match) return false;
    if (round.tried.has(message.author.id)) return true;
    round.tried.add(message.author.id);
    if (match[1].toUpperCase() !== round.letter) return true;

    clearTimeout(round.timeout);
    active.delete(message.guild.id);
    const points = await QuizScore.addPoint(message.guild.id, message.author.id);
    await message.channel.send({
        embeds: [EmbedHelper.success(`Bonne réponse de ${message.author} : **${round.letter}. ${round.answer}**\n+1 point · total **${points}** point${points > 1 ? 's' : ''}`)],
        allowedMentions: { parse: [] },
    }).catch(() => {});
    return true;
}

async function tick(client) {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
        if (active.has(guild.id)) continue;
        const settings = await getGuildSettings(client, guild.id, { create: false }).catch(() => null);
        const quiz = config(settings);
        if (!quiz.enabled || !quiz.channel) continue;
        const interval = Math.min(Math.max(Number(quiz.interval) || 3, 1), 120) * 60_000;
        if (!lastAsked.has(guild.id)) { lastAsked.set(guild.id, now); continue; }
        if (now - lastAsked.get(guild.id) < interval) continue;
        await ask(client, guild, settings).catch(error => Logger.warn(`[Quiz] ${guild.id} : ${error.message}`));
    }
}

function start(client) {
    if (timer) clearInterval(timer);
    timer = setInterval(() => tick(client).catch(() => {}), TICK);
    timer.unref?.();
}

/** Arrêt du quiz sur un serveur (désactivation) : la question en cours est annulée. */
function stop(guildId) {
    const round = active.get(guildId);
    if (round) clearTimeout(round.timeout);
    active.delete(guildId);
    lastAsked.delete(guildId);
}

// peek : bonne lettre de la question en cours (lecture seule, pour les tests).
const peek = guildId => active.get(guildId)?.letter || null;

module.exports = { start, stop, ask, onMessage, config, peek, THEMES, THEME_KEYS };
