'use strict';

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    UserSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const TempVoice = require('../models/TempVoice');
const Logger = require('./logger');
const { mapLimit, settleWithin } = require('./concurrency');
const { colors } = require('../config/brand');

const PREFIX = 'tvc';
const OWNER_PERMS = { ViewChannel: true, Connect: true, ManageChannels: true, MoveMembers: true };
const CLEAR_OWNER_PERMS = { ViewChannel: null, Connect: null, ManageChannels: null, MoveMembers: null };

// customId = tvc_<channelId>_<action>[_select|_modal]
function parseId(customId) {
    const parts = customId.split('_');
    const suffix = ['select', 'modal'].includes(parts[parts.length - 1]) ? parts.pop() : null;
    const action = parts.pop();
    return { channelId: parts.slice(1).join('_'), action, suffix };
}
const cid = (channelId, action, suffix) => [PREFIX, channelId, action, suffix].filter(Boolean).join('_');

// ---------------------------------------------------------------------------
// Panneau : état en direct + boutons
// ---------------------------------------------------------------------------
function buildPanel(channel, tempVoc) {
    const owner = channel.guild.members.cache.get(tempVoc.ownerId);
    const count = channel.members?.size ?? 0;
    const limit = channel.userLimit || 0;
    const permitted = tempVoc.permitted?.length || 0;
    const denied = tempVoc.denied?.length || 0;

    const embed = new EmbedBuilder()
        .setColor(tempVoc.locked ? colors.WARNING : colors.SUCCESS)
        .setTitle(`🎤 ${channel.name}`)
        .setDescription([
            `**Propriétaire** · <@${tempVoc.ownerId}>${owner?.voice?.channelId === channel.id ? '' : ' *(absent : ✋ Réclamer)*'}`,
            `**Accès** · ${tempVoc.locked ? '🔒 verrouillé' : '🔓 ouvert'} · ${tempVoc.hidden ? '🙈 masqué' : '👁️ visible'}`,
            `**Membres** · ${count}${limit ? ` / ${limit}` : ' · places illimitées'}`,
            `**Autorisés** · ${permitted} · **Interdits** · ${denied}`,
        ].join('\n'))
        .setFooter({ text: 'Actions réservées au propriétaire du vocal' });
    if (owner) embed.setThumbnail(owner.displayAvatarURL({ size: 128 }));

    const id = action => cid(channel.id, action);
    const btn = (action, label, emoji, style = ButtonStyle.Secondary) =>
        new ButtonBuilder().setCustomId(id(action)).setLabel(label).setEmoji(emoji).setStyle(style);

    const components = [
        new ActionRowBuilder().addComponents(
            tempVoc.locked ? btn('unlock', 'Déverrouiller', '🔓', ButtonStyle.Success) : btn('lock', 'Verrouiller', '🔒'),
            tempVoc.hidden ? btn('show', 'Afficher', '👁️', ButtonStyle.Success) : btn('hide', 'Masquer', '🙈'),
            btn('rename', 'Renommer', '✏️'),
            btn('limit', 'Places', '👥'),
        ),
        new ActionRowBuilder().addComponents(
            btn('permit', 'Autoriser', '➕'),
            btn('ban', 'Interdire', '🚫'),
            btn('unban', 'Débannir', '🔑'),
            btn('kick', 'Déconnecter', '👢'),
        ),
        new ActionRowBuilder().addComponents(
            btn('transfer', 'Transférer', '👑'),
            btn('claim', 'Réclamer', '✋'),
            btn('delete', 'Supprimer', '🗑️', ButtonStyle.Danger),
        ),
    ];
    return { embeds: [embed], components };
}

async function sendPanel(guild, channel) {
    try {
        const tempVoc = await TempVoice.findOne({ channelId: channel.id });
        if (!tempVoc) return;
        const message = await channel.send(buildPanel(channel, tempVoc)).catch(() => null);
        if (message) await TempVoice.updateOne({ channelId: channel.id }, { panelMessageId: message.id });
    } catch { /* salon vocal indisponible */ }
}

/** Met à jour le panneau d'origine après une action faite depuis un message éphémère. */
async function refreshPanel(channel) {
    const tempVoc = await TempVoice.findOne({ channelId: channel.id });
    if (!tempVoc?.panelMessageId) return;
    const message = await channel.messages.fetch(tempVoc.panelMessageId).catch(() => null);
    if (message) await message.edit(buildPanel(channel, tempVoc)).catch(() => {});
}

// Arrivées/départs : un seul rafraîchissement par salon toutes les 3 s au plus.
const pendingRefresh = new Map();
function scheduleRefresh(channel) {
    if (!channel || pendingRefresh.has(channel.id)) return;
    const timer = setTimeout(() => {
        pendingRefresh.delete(channel.id);
        if (channel.guild.channels.cache.has(channel.id)) refreshPanel(channel).catch(() => {});
    }, 3000);
    timer.unref?.();
    pendingRefresh.set(channel.id, timer);
}

// ---------------------------------------------------------------------------
// Contexte : salon + vérification du propriétaire
// ---------------------------------------------------------------------------
const reply = (interaction, content) => (interaction.deferred || interaction.replied
    ? interaction.followUp({ content, flags: 64 })
    : interaction.reply({ content, flags: 64 })).catch(() => {});

async function getContext(interaction, { ownerOnly = true } = {}) {
    const { channelId } = parseId(interaction.customId);
    const guild = interaction.guild;
    if (!guild || !channelId) {
        await reply(interaction, '❌ Panneau invalide.');
        return null;
    }
    const tempVoc = await TempVoice.findOne({ guildId: guild.id, channelId });
    if (!tempVoc) {
        await reply(interaction, '❌ Ce salon vocal temporaire n\'existe plus.');
        return null;
    }
    if (ownerOnly && tempVoc.ownerId !== interaction.user.id) {
        await reply(interaction, '❌ Seul le propriétaire du vocal peut faire ça.');
        return null;
    }
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        await reply(interaction, '❌ Salon vocal introuvable.');
        return null;
    }
    return { guild, channel, tempVoc };
}

async function transferOwnership(channel, tempVoc, newOwnerId) {
    await channel.permissionOverwrites.edit(tempVoc.ownerId, CLEAR_OWNER_PERMS).catch(() => {});
    await channel.permissionOverwrites.edit(newOwnerId, OWNER_PERMS);
    await TempVoice.updateOne({ channelId: channel.id }, { ownerId: newOwnerId, $pull: { denied: newOwnerId } });
}

// ---------------------------------------------------------------------------
// Boutons
// ---------------------------------------------------------------------------
async function handleButton(client, interaction) {
    if (!interaction.customId.startsWith(`${PREFIX}_`)) return;
    const { action } = parseId(interaction.customId);

    // « Réclamer » est la seule action ouverte à tous (propriétaire parti).
    const ctx = await getContext(interaction, { ownerOnly: action !== 'claim' });
    if (!ctx) return;
    const { channel, tempVoc, guild } = ctx;
    const everyone = guild.roles.everyone;

    // Bascule d'état : acquitte puis redessine le panneau lui-même (pas de message en plus).
    const toggle = async (overwrite, extra, fields) => {
        await interaction.deferUpdate();
        await Promise.all([channel.permissionOverwrites.edit(everyone, overwrite), ...extra]);
        await TempVoice.updateOne({ channelId: channel.id }, fields);
        return interaction.editReply(buildPanel(channel, { ...tempVoc, ...fields })).catch(() => {});
    };

    switch (action) {
        case 'lock': return toggle({ Connect: false }, [], { locked: true });
        case 'unlock': return toggle({ Connect: null }, [], { locked: false });
        // Le propriétaire garde ViewChannel, sinon il ne voit plus son salon ni ce panneau.
        case 'hide': return toggle({ ViewChannel: false }, [channel.permissionOverwrites.edit(tempVoc.ownerId, { ViewChannel: true })], { hidden: true });
        case 'show': return toggle({ ViewChannel: null }, [], { hidden: false });
        case 'rename': return openModal(interaction, channel, 'rename', '✏️ Renommer le vocal', 'Nouveau nom (32 caractères max)', 32);
        case 'limit': return openModal(interaction, channel, 'limit', '👥 Nombre de places', 'Places (0 = illimité, max 99)', 2);
        case 'permit':
        case 'ban':
        case 'transfer': {
            const labels = {
                permit: 'Qui peut entrer même si le salon est verrouillé ?',
                ban: 'Qui ne doit plus pouvoir entrer ?',
                transfer: 'À qui donner la propriété du salon ?',
            };
            return interaction.reply({
                content: labels[action],
                components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder()
                    .setCustomId(cid(channel.id, action, 'select'))
                    .setPlaceholder('Choisir un membre')
                    .setMinValues(1)
                    .setMaxValues(action === 'transfer' ? 1 : 10))],
                flags: 64,
            });
        }
        case 'unban':
        case 'kick': {
            const ids = action === 'unban'
                ? (tempVoc.denied || [])
                : [...channel.members.keys()].filter(memberId => memberId !== interaction.user.id);
            if (!ids.length) return reply(interaction, action === 'unban' ? 'ℹ️ Personne n\'est interdit.' : 'ℹ️ Personne d\'autre n\'est dans le vocal.');
            const options = ids.slice(0, 25).map(memberId => {
                const member = guild.members.cache.get(memberId);
                return new StringSelectMenuOptionBuilder().setLabel((member?.user.tag || memberId).slice(0, 100)).setValue(memberId);
            });
            return interaction.reply({
                content: action === 'unban' ? 'Qui doit retrouver l\'accès au vocal ?' : 'Qui déconnecter du vocal ?',
                components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
                    .setCustomId(cid(channel.id, action, 'select'))
                    .setPlaceholder('Choisir')
                    .setMinValues(1)
                    .setMaxValues(options.length)
                    .addOptions(options))],
                flags: 64,
            });
        }
        case 'claim': {
            if (tempVoc.ownerId === interaction.user.id) return reply(interaction, 'ℹ️ Tu es déjà propriétaire de ce vocal.');
            if (interaction.member?.voice?.channelId !== channel.id) return reply(interaction, '❌ Rejoins le vocal pour le réclamer.');
            if (channel.members.has(tempVoc.ownerId)) return reply(interaction, '❌ Le propriétaire est encore dans le vocal.');
            await interaction.deferUpdate();
            await transferOwnership(channel, tempVoc, interaction.user.id);
            await interaction.editReply(buildPanel(channel, { ...tempVoc, ownerId: interaction.user.id })).catch(() => {});
            return interaction.followUp({ content: '👑 Tu es maintenant propriétaire de ce vocal.', flags: 64 }).catch(() => {});
        }
        case 'delete': {
            const { confirmInteraction } = require('./commandConfirmation');
            if (!await confirmInteraction(interaction, `Supprimer le salon vocal ${channel.name}`)) return;
            const current = await TempVoice.findOne({ channelId: channel.id });
            const blocked = await require('../services/blacklistService').isBlocked(interaction.user.id);
            if (blocked || current?.ownerId !== interaction.user.id) return interaction.followUp({ content: 'Action arrêtée : vous ne possédez plus ce salon.', flags: 64 });
            await channel.delete('Suppression via panneau vocal');
            await TempVoice.deleteOne({ channelId: channel.id });
            return;
        }
        default:
            return reply(interaction, 'Action inconnue.');
    }
}

function openModal(interaction, channel, action, title, label, maxLength) {
    const modal = new ModalBuilder()
        .setCustomId(cid(channel.id, action, 'modal'))
        .setTitle(title)
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(action).setLabel(label).setStyle(TextInputStyle.Short)
                .setMaxLength(maxLength).setRequired(true),
        ));
    return interaction.showModal(modal).catch(() => {});
}

// ---------------------------------------------------------------------------
// Menus de sélection (autoriser / interdire / débannir / déconnecter / transférer)
// ---------------------------------------------------------------------------
async function handleSelectMenu(client, interaction) {
    const { action, suffix } = parseId(interaction.customId);
    if (suffix !== 'select') return;
    const ctx = await getContext(interaction);
    if (!ctx) return;
    const { channel, tempVoc, guild } = ctx;
    const values = (interaction.values || []).filter(id => id !== tempVoc.ownerId && id !== client.user.id);
    if (!values.length) return interaction.update({ content: '❌ Sélection invalide (tu ne peux pas te cibler toi-même).', components: [] }).catch(() => {});

    await interaction.deferUpdate();
    let result;
    switch (action) {
        case 'permit':
            await mapLimit(values, userId => channel.permissionOverwrites.edit(userId, { Connect: true, ViewChannel: true }), 3);
            await TempVoice.updateOne({ channelId: channel.id }, { $addToSet: { permitted: { $each: values } }, $pull: { denied: { $each: values } } });
            result = `➕ ${values.map(id => `<@${id}>`).join(', ')} peu${values.length > 1 ? 'vent' : 't'} entrer.`;
            break;
        case 'ban':
            await mapLimit(values, async userId => {
                await channel.permissionOverwrites.edit(userId, { Connect: false });
                const member = guild.members.cache.get(userId);
                if (member?.voice.channelId === channel.id) await member.voice.disconnect('Accès refusé à ce salon').catch(() => {});
            }, 3);
            await TempVoice.updateOne({ channelId: channel.id }, { $addToSet: { denied: { $each: values } }, $pull: { permitted: { $each: values } } });
            result = `🚫 **${values.length}** personne(s) n'ont plus accès à ce vocal.`;
            break;
        case 'unban':
            await mapLimit(values, userId => channel.permissionOverwrites.delete(userId).catch(() => {}), 3);
            await TempVoice.updateOne({ channelId: channel.id }, { $pull: { denied: { $each: values } } });
            result = `🔑 ${values.map(id => `<@${id}>`).join(', ')} peu${values.length > 1 ? 'vent' : 't'} de nouveau entrer.`;
            break;
        case 'kick':
            await mapLimit(values, async userId => {
                const member = guild.members.cache.get(userId);
                if (member?.voice.channelId === channel.id) await member.voice.disconnect('Déconnecté par le propriétaire du vocal').catch(() => {});
            }, 3);
            result = `👢 **${values.length}** personne(s) déconnectée(s).`;
            break;
        case 'transfer': {
            const member = guild.members.cache.get(values[0]) || await guild.members.fetch(values[0]).catch(() => null);
            if (!member || member.user.bot) { result = '❌ Membre invalide.'; break; }
            await transferOwnership(channel, tempVoc, member.id);
            result = `👑 ${member} est maintenant propriétaire du vocal.`;
            break;
        }
        default:
            result = 'Action inconnue.';
    }

    await interaction.editReply({ content: result, components: [] }).catch(() => {});
    await refreshPanel(channel);
}

// ---------------------------------------------------------------------------
// Modals : renommer + places
// ---------------------------------------------------------------------------
async function handleModal(client, interaction) {
    const { action, suffix } = parseId(interaction.customId);
    if (suffix !== 'modal' || !['rename', 'limit'].includes(action)) return;
    const ctx = await getContext(interaction);
    if (!ctx) return;
    const { channel } = ctx;

    // Formulaire obsolète (bot redémarré entre l'ouverture et l'envoi).
    if (!interaction.fields?.fields?.has(action)) return reply(interaction, '❌ Ce formulaire a expiré. Rouvre-le depuis le panneau.');
    const value = interaction.fields.getTextInputValue(action) || '';

    if (action === 'rename') {
        const name = value.trim().slice(0, 32);
        if (!name) return reply(interaction, '❌ Nom invalide.');
        await interaction.deferReply({ flags: 64 });
        const pending = channel.setName(name);
        const applied = await settleWithin(pending, 8000);
        if (!applied.done) {
            // Discord limite les renommages (2 / 10 min) : la requête reste en file d'attente.
            pending.then(() => TempVoice.updateOne({ channelId: channel.id }, { name }).then(() => refreshPanel(channel))).catch(() => {});
            return interaction.editReply({ content: '⏳ Discord limite les renommages (2 toutes les 10 minutes). Le nouveau nom sera appliqué dès que possible.' }).catch(() => {});
        }
        await TempVoice.updateOne({ channelId: channel.id }, { name });
        await interaction.editReply({ content: `✏️ Salon renommé : **${name}**` }).catch(() => {});
        return refreshPanel(channel);
    }

    const limit = parseInt(value, 10);
    if (isNaN(limit) || limit < 0 || limit > 99) return reply(interaction, '❌ Nombre invalide (0 à 99).');
    await interaction.deferReply({ flags: 64 });
    await channel.setUserLimit(limit);
    await TempVoice.updateOne({ channelId: channel.id }, { limit });
    await interaction.editReply({ content: `👥 Places : **${limit === 0 ? 'illimitées' : limit}**.` }).catch(() => {});
    return refreshPanel(channel);
}

// Filet de sécurité : une erreur (permission manquante, salon supprimé…) ne doit jamais
// laisser l'utilisateur sans réponse.
function safe(handler, label) {
    return async (client, interaction) => {
        try {
            return await handler(client, interaction);
        } catch (error) {
            Logger.error(`[TempVoicePanel] Erreur ${label}:`, error.message || String(error));
            await reply(interaction, '❌ Action impossible (permission manquante pour le bot ou limite Discord). Réessaie dans un instant.');
        }
    };
}

module.exports = {
    PREFIX,
    sendPanel,
    refreshPanel,
    scheduleRefresh,
    handleButton: safe(handleButton, 'bouton'),
    handleSelectMenu: safe(handleSelectMenu, 'menu'),
    handleModal: safe(handleModal, 'modal'),
};
