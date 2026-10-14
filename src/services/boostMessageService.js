'use strict';

const { getGuildSettings } = require('../utils/guildSettings');
const Logger = require('../utils/logger');

// Messages utilisés tant que le serveur n'a pas écrit les siens (+boostmsg message / unboost).
const DEFAULTS = {
    boost: 'Merci {user} pour le boost ! **{server}** a maintenant {boosts} boost(s).',
    unboost: '{user} ne boost plus **{server}**.',
};

function render(template, member) {
    const guild = member.guild;
    return String(template)
        // {user} et {username} : mention cliquable (sans ping). {name} : le pseudo en texte.
        .replace(/{user}|{username}|{mention}/g, () => `<@${member.id}>`)
        .replace(/{name}/g, () => member.displayName || member.user.username)
        .replace(/{server}/g, () => guild.name)
        .replace(/{boosts}/g, () => String(guild.premiumSubscriptionCount || 0))
        .slice(0, 2000);
}

/** Message du serveur pour un boost ou un arrêt de boost, prêt à envoyer. */
function buildMessage(config, kind, member) {
    const template = (kind === 'boost' ? config?.message : config?.unboostMessage) || DEFAULTS[kind];
    return {
        content: render(template, member),
        // Jamais de ping : la mention {user} s'affiche, mais personne n'est notifié.
        allowedMentions: { parse: [] },
        // Texte écrit par le serveur : envoyé tel quel (emojis compris), comme le message de bienvenue.
        raw: true,
    };
}

async function onMemberUpdate(client, oldMember, newMember) {
    // Ancien état inconnu (membre pas encore en cache) : impossible de savoir s'il boostait.
    if (oldMember.partial) return;
    const started = !oldMember.premiumSince && Boolean(newMember.premiumSince);
    const stopped = Boolean(oldMember.premiumSince) && !newMember.premiumSince;
    if (!started && !stopped) return;

    const guild = newMember.guild;
    const settings = await getGuildSettings(client, guild.id, { create: false });
    const config = settings?.boostMessage;

    // Rôle des boosters : donné au boost, retiré à la fin (même si les messages sont coupés).
    if (config?.role) {
        const reason = started ? 'Boost du serveur' : 'Fin du boost';
        const action = started ? newMember.roles.add(config.role, reason) : newMember.roles.remove(config.role, reason);
        await action.catch(error => Logger.warn(`[Boost] Rôle booster impossible sur ${guild.id} : ${error.message}`));
    }

    if (!config?.enabled || !config.channel) return;
    if (stopped && config.unboostEnabled === false) return;

    const channel = guild.channels.cache.get(config.channel);
    if (!channel?.isTextBased?.()) return;
    await channel.send(buildMessage(config, started ? 'boost' : 'unboost', newMember)).catch(error => {
        Logger.warn(`[Boost] Message impossible dans ${guild.id}/${channel.id} : ${error.message}`);
    });
}

module.exports = { DEFAULTS, buildMessage, onMemberUpdate };
