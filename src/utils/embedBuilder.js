'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getEmoji } = require('../config/emojis');
const Brand = require('../config/brand');
const { context, EXAMPLES } = require('./commandPresentation');

// Emoji par type d'action de modération — utilisé par EmbedHelper.moderation()
const ACTION_EMOJI_KEYS = {
    ban: 'BAN', tempban: 'BAN', unban: 'UNBAN',
    kick: 'KICK',
    mute: 'MUTE', tempmute: 'MUTE', cmute: 'MUTE', unmute: 'UNMUTE', uncmute: 'UNMUTE', unmuteall: 'UNMUTE',
    warn: 'WARN',
    timeout: 'TIMEOUT',
    lock: 'LOCK', lockall: 'LOCK', globalLock: 'LOCK', unlock: 'UNLOCK', unlockall: 'UNLOCK',
    hide: 'HIDE', hideall: 'HIDE', unhide: 'UNHIDE', unhideall: 'UNHIDE',
    prison: 'PRISON', unprison: 'UNPRISON', unprisonall: 'UNPRISON',
    addrole: 'ROLE_ADD', delrole: 'ROLE_REMOVE', derank: 'DERANK',
    tempcmute: 'MUTE', clear: 'TRASH',
};

const ACTION_LABELS = {
    ban: 'Membre banni', tempban: 'Membre banni temporairement', unban: 'Membre débanni',
    kick: 'Membre expulsé',
    mute: 'Membre rendu muet', tempmute: 'Membre rendu muet', unmute: 'Parole rendue',
    cmute: 'Mute salon', tempcmute: 'Mute salon', uncmute: 'Mute salon retiré',
    warn: 'Avertissement', timeout: 'Exclusion temporaire',
    derank: 'Membre derank', addrole: 'Rôle ajouté', delrole: 'Rôle retiré',
    lock: 'Salon verrouillé', unlock: 'Salon déverrouillé',
    hide: 'Salon masqué', unhide: 'Salon visible',
    prison: 'Membre en prison', unprison: 'Membre libéré',
    clear: 'Messages supprimés',
};

// Rouge = sanction, ambre = avertissement, vert = levée de sanction
const ACTION_COLORS = {
    warn: 0xF4B63F, clear: 0xF4B63F, timeout: 0xF4B63F,
    unban: 0x3FD39C, unmute: 0x3FD39C, uncmute: 0x3FD39C, unlock: 0x3FD39C,
    unhide: 0x3FD39C, unprison: 0x3FD39C, addrole: 0x3FD39C,
};

// Palette de couleurs — sobre, moderne, cohérent
const Colors = Brand.colors;

// Réponses courtes : une icône suffit, sans horodatage décoratif.
function statusEmbed(kind, description, options = {}) {
    const hasTitle = typeof options === 'string';
    const body = String(hasTitle ? options : description);
    const settings = hasTitle ? {} : options;
    // Some commands already include the status icon; keep exactly one.
    const clean = body.replace(/^(?:(?:✅|❌|⚠️?|✔️?|✖️?)\s*)+/u, '');
    const embed = new EmbedBuilder().setColor(Colors[kind]);
    // Réponse courte (succès / erreur / avertissement) : supprimable après la commande.
    Object.defineProperty(embed, 'statusKind', { value: kind, enumerable: false });
    if (hasTitle) {
        embed.setTitle(String(description)).setDescription(clean);
    } else {
        embed.setDescription(`${getEmoji(kind)} ${clean}`);
    }
    if (settings.timestamp === true) embed.setTimestamp();
    if (settings.footer) embed.setFooter({ text: settings.footer });
    const current = context.getStore();
    if (kind === 'ERROR' && current) {
        const { command, prefix } = current;
        const { formatUsage } = require('./helpEmbeds');
        const example = EXAMPLES[command.name];
        const value = example ? prefix + example : formatUsage(prefix, command);
        embed.addFields({ name: example ? 'Exemple' : 'Syntaxe', value: '`' + value.replace(/`/g, '').slice(0, 950) + '`' });
        embed.setFooter({ text: prefix + 'help ' + command.name + ' pour les détails' });
    }
    return embed;
}

class EmbedHelper {

    // ─── Succès ───────────────────────────────────────────────
    static success(description, options = {}) {
        return statusEmbed('SUCCESS', description, options);
    }

    // ─── Erreur ───────────────────────────────────────────────
    static error(description, options = {}) {
        return statusEmbed('ERROR', description, options);
    }

    // ─── Avertissement ────────────────────────────────────────
    static warning(description, options = {}) {
        return statusEmbed('WARNING', description, options);
    }

    // ─── Info générique (titre + body) ────────────────────────
    static info(title, description, options = {}) {
        const prefix = options.emoji ? `${options.emoji} ` : '';
        const embed = new EmbedBuilder()
            .setColor(options.color ?? Colors.PRIMARY)
            .setTitle(`${prefix}${title}`)
            .setDescription(description)
            .setTimestamp(options.timestamp === true ? new Date() : null);

        if (options.thumbnail)  embed.setThumbnail(options.thumbnail);
        if (options.image)      embed.setImage(options.image);
        if (options.footer)     embed.setFooter({ text: options.footer, iconURL: options.footerIcon });
        if (options.author)     embed.setAuthor({ name: options.author, iconURL: options.authorIcon });
        if (options.fields)     embed.addFields(...options.fields);

        return embed;
    }

    // ─── Modération (ban, kick, mute, warn…) ──────────────────
    static moderation({ action, user, moderator, reason, duration, caseId, color }) {
        const type = String(action || '').toLowerCase();
        const emojiKey = ACTION_EMOJI_KEYS[type];
        const emoji = emojiKey ? `${getEmoji(emojiKey)} ` : '';
        const label = ACTION_LABELS[type] || action;
        const avatar = user.displayAvatarURL?.({ size: 128 });
        const embed = new EmbedBuilder()
            .setColor(color || ACTION_COLORS[type] || Colors.MODERATION)
            .setTitle(`${emoji}${label}`)
            .setDescription(`<@${user.id || user}> · \`${user.tag || user}\``)
            .addFields(
                { name: `${getEmoji('USER')} Modérateur`, value: `<@${moderator.id || moderator}>`, inline: true },
                { name: `${getEmoji('NOTE')} Raison`,     value: reason || 'Aucune raison fournie', inline: false },
            )
            .setTimestamp()
            .setFooter({ text: `Sanction #${caseId} · ID ${user.id || user}` });

        if (duration) {
            embed.addFields({ name: `${getEmoji('CLOCK')} Durée`, value: duration, inline: true });
        }
        if (avatar) embed.setThumbnail(avatar);

        return embed;
    }

    // ─── Log serveur (audit logs, events…) ────────────────────
    static log({ title, description, color, fields = [], footer, user }) {
        const embed = new EmbedBuilder()
            .setColor(color || Colors.LOG)
            .setTitle(title)
            .setTimestamp();

        if (description)  embed.setDescription(description);
        if (fields.length) embed.addFields(...fields);
        if (footer)       embed.setFooter({ text: footer });
        if (user?.displayAvatarURL) embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));

        return embed;
    }

    // ─── Boutons de confirmation ───────────────────────────────
    static confirmButtons(confirmId, cancelId) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(confirmId)
                .setLabel('Confirmer')
                .setEmoji('✔️')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(cancelId)
                .setLabel('Annuler')
                .setEmoji('✖️')
                .setStyle(ButtonStyle.Danger)
        );
    }

    // ─── Pagination ───────────────────────────────────────────
    static paginationButtons(prevId, nextId, current, total) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(prevId)
                .setLabel('Précédent')
                .setEmoji(getEmoji('ARROW_LEFT'))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(current === 0),
            new ButtonBuilder()
                .setCustomId('page_info')
                .setLabel(`${current + 1} / ${total}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(nextId)
                .setLabel('Suivant')
                .setEmoji(getEmoji('ARROW_RIGHT'))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(current === total - 1)
        );
    }

    // ─── Utilitaire paginate ───────────────────────────────────
    static paginate(items, page, perPage = 10) {
        const totalPages = Math.max(1, Math.ceil(items.length / perPage));
        const currentPage = Math.max(0, Math.min(page, totalPages - 1));
        const start = currentPage * perPage;
        const pageItems = items.slice(start, start + perPage);
        return { items: pageItems, page: currentPage, totalPages, total: items.length };
    }
}

EmbedHelper.Colors = Colors;
EmbedHelper.Emoji = getEmoji;

module.exports = EmbedHelper;
