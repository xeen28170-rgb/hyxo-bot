'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Palette de couleurs — sobre, moderne, cohérent
const Colors = {
    PRIMARY:    0x5865F2, // Blurple Discord — couleur principale du bot
    SUCCESS:    0x2ECC71, // Vert doux
    ERROR:      0xE74C3C, // Rouge net
    WARNING:    0xF39C12, // Ambre
    INFO:       0x3498DB, // Bleu info
    MODERATION: 0xE74C3C, // Rouge modération
    ANTIRAID:   0xE67E22, // Orange antiraid
    TICKET:     0x9B59B6, // Violet tickets
    GIVEAWAY:   0xF1C40F, // Jaune giveaway
    TEMPVOC:    0x1ABC9C, // Teal vocal
    AUTOMOD:    0xE67E22, // Orange automod
    NEUTRAL:    0x2C2F33, // Gris foncé neutre
    LOG:        0x95A5A6, // Gris log
};

// Séparateur visuel léger — ligne vide, pas de tirets ni pixels
const SEP = '\u200B';

class EmbedHelper {

    // ─── Succès ───────────────────────────────────────────────
    static success(description, options = {}) {
        return new EmbedBuilder()
            .setColor(Colors.SUCCESS)
            .setDescription(`${description}`)
            .setTimestamp(options.timestamp !== false ? new Date() : null);
    }

    // ─── Erreur ───────────────────────────────────────────────
    static error(description, options = {}) {
        return new EmbedBuilder()
            .setColor(Colors.ERROR)
            .setDescription(`${description}`)
            .setTimestamp(options.timestamp !== false ? new Date() : null);
    }

    // ─── Avertissement ────────────────────────────────────────
    static warning(description, options = {}) {
        return new EmbedBuilder()
            .setColor(Colors.WARNING)
            .setDescription(`${description}`)
            .setTimestamp(options.timestamp !== false ? new Date() : null);
    }

    // ─── Info générique (titre + body) ────────────────────────
    static info(title, description, options = {}) {
        const embed = new EmbedBuilder()
            .setColor(options.color || Colors.PRIMARY)
            .setTitle(title)
            .setDescription(description)
            .setTimestamp(options.timestamp !== false ? new Date() : null);

        if (options.thumbnail)  embed.setThumbnail(options.thumbnail);
        if (options.image)      embed.setImage(options.image);
        if (options.footer)     embed.setFooter({ text: options.footer, iconURL: options.footerIcon });
        if (options.author)     embed.setAuthor({ name: options.author, iconURL: options.authorIcon });
        if (options.fields)     embed.addFields(...options.fields);

        return embed;
    }

    // ─── Modération (ban, kick, mute, warn…) ──────────────────
    static moderation({ action, user, moderator, reason, duration, caseId, color }) {
        const embed = new EmbedBuilder()
            .setColor(color || Colors.MODERATION)
            .setAuthor({
                name: `${action}  ·  cas #${caseId}`,
                iconURL: user.displayAvatarURL?.({ dynamic: true }) ?? undefined,
            })
            .addFields(
                { name: 'Utilisateur',  value: `<@${user.id || user}> \`${user.tag || user}\``, inline: true },
                { name: 'Modérateur',   value: `<@${moderator.id || moderator}>`, inline: true },
                { name: SEP, value: SEP, inline: false },
                { name: 'Raison',       value: reason || 'Aucune raison fournie', inline: false },
            )
            .setTimestamp()
            .setFooter({ text: `ID cible : ${user.id || user}` });

        if (duration) {
            embed.addFields({ name: 'Durée', value: duration, inline: true });
        }

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
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(current === total - 1)
        );
    }

    // ─── Utilitaire paginate ───────────────────────────────────
    static paginate(items, page, perPage = 10) {
        const totalPages = Math.ceil(items.length / perPage);
        const currentPage = Math.max(0, Math.min(page, totalPages - 1));
        const start = currentPage * perPage;
        const pageItems = items.slice(start, start + perPage);
        return { items: pageItems, page: currentPage, totalPages, total: items.length };
    }
}

EmbedHelper.Colors = Colors;

module.exports = EmbedHelper;
