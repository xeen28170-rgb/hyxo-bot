'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const EmbedHelper = require('../../utils/embedBuilder');
const Permissions = require('../../utils/permissions');

const PANEL_TTL = 10 * 60 * 1000;
const HTTPS_LINK = /^https:\/\/\S+$/i;

// ─── Profil global ↔ profil de serveur ───────────────────────────

// Un surnom, un avatar ou une bannière définis sur un serveur masquent le profil global :
// on les retire partout pour que le changement soit visible sur tous les serveurs.
// La fonction est autonome car elle est sérialisée par broadcastEval quand le bot est shardé.
async function clearGuildOverrides(c, { fields }) {
    let cleared = 0;
    for (const guild of c.guilds.cache.values()) {
        const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
        if (!me) continue;
        const patch = {};
        if (fields.includes('nick') && me.nickname) patch.nick = null;
        if (fields.includes('avatar') && me.avatar) patch.avatar = null;
        if (fields.includes('banner') && me.banner) patch.banner = null;
        if (!Object.keys(patch).length) continue;
        try {
            await guild.members.editMe(patch);
            cleared++;
        } catch { /* permissions manquantes ou serveur indisponible */ }
    }
    return cleared;
}

async function syncAllGuilds(client, fields) {
    if (client.shard) {
        const results = await client.shard.broadcastEval(clearGuildOverrides, { context: { fields } });
        return results.reduce((a, b) => a + b, 0);
    }
    return clearGuildOverrides(client, { fields });
}

function describeError(err) {
    if (err?.code === 50035 && /USERNAME_RATE_LIMIT|too fast/i.test(err.message)) {
        return 'Discord limite le changement de nom à 2 fois par heure. Réessaie plus tard.';
    }
    if (err?.code === 50035) return `Valeur refusée par Discord : ${err.message}`;
    if (err?.code === 50013) return 'Il me manque la permission « Changer le pseudo » sur ce serveur.';
    return `Erreur : ${err?.message || err}`;
}

// Champs du profil : clé → libellé, champ côté serveur (editMe) et modification globale.
const FIELDS = {
    name: { label: 'Nom', guildKey: 'nick', override: 'nick', global: (client, v) => client.user.setUsername(v) },
    avatar: { label: 'Photo', feminine: true, guildKey: 'avatar', override: 'avatar', global: (client, v) => client.user.setAvatar(v) },
    banner: { label: 'Bannière', feminine: true, guildKey: 'banner', override: 'banner', global: (client, v) => client.user.setBanner(v) },
    bio: { label: 'Bio', feminine: true, guildKey: 'bio', override: null, global: (client, v) => client.application.edit({ description: v }) },
};

/**
 * Applique une valeur. `scope` vaut 'global' (tous les serveurs) ou 'guild' (ce serveur).
 * Une valeur vide sur un serveur retire la personnalisation et revient au profil global.
 */
async function applyField(client, guild, key, value, scope) {
    const field = FIELDS[key];
    // discord.js lit un chemin local comme un fichier : sans ce contrôle, « -set pic .env »
    // enverrait le fichier du token à Discord. Seuls les liens https sont acceptés.
    if ((key === 'avatar' || key === 'banner') && value && !HTTPS_LINK.test(value)) {
        throw new Error('Envoie un lien d\'image qui commence par https://, ou joins une image au message.');
    }
    if (key === 'bio' && scope === 'global' && !client.application) {
        throw new Error('Informations du bot pas encore chargées, réessaie dans quelques secondes.');
    }
    if (scope === 'guild') {
        await guild.members.editMe({ [field.guildKey]: value || null });
        const e = field.feminine ? 'e' : '';
        return value ? `${field.label} mis${e} à jour sur ce serveur.` : `${field.label} de ce serveur retiré${e}, le profil global s'affiche.`;
    }
    if (!value && key !== 'bio') throw new Error(`Indique une valeur pour : ${field.label}.`);
    await field.global(client, value);
    const cleared = field.override ? await syncAllGuilds(client, [field.override]).catch(() => 0) : 0;
    const extra = cleared ? ` Personnalisation retirée sur ${cleared} serveur(s) pour l'afficher partout.` : '';
    return `${field.label} mis${field.feminine ? 'e' : ''} à jour sur tous les serveurs.${extra}`;
}

// ─── Panneau ─────────────────────────────────────────────────────

async function readProfile(client, guild) {
    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    await client.application?.fetch?.().catch(() => {});
    const link = url => (url ? `[Voir l'image](${url})` : 'Aucune');
    const avatar = client.user.displayAvatarURL({ size: 512 });
    const banner = client.user.bannerURL?.({ size: 1024 }) ?? null;
    const guildAvatar = me?.avatar ? me.displayAvatarURL({ size: 512 }) : null;
    const guildBanner = me?.banner ? me.bannerURL({ size: 1024 }) : null;
    return {
        global: {
            name: client.user.username,
            avatar: link(avatar), banner: link(banner),
            bio: client.application?.description || 'Aucune',
            thumbnail: avatar, image: banner,
        },
        guild: {
            name: me?.nickname || 'Profil global',
            avatar: guildAvatar ? link(guildAvatar) : 'Profil global',
            banner: guildBanner ? link(guildBanner) : 'Profil global',
            bio: 'Modifiable avec le bouton Bio',
            thumbnail: guildAvatar || avatar, image: guildBanner || banner,
        },
    };
}

function render(profile, scope, notice) {
    const values = profile[scope];
    const embed = new EmbedBuilder()
        .setColor(EmbedHelper.Colors.PRIMARY)
        .setTitle('Profil du bot')
        .setDescription(scope === 'global'
            ? 'Les changements s’appliquent sur **tous les serveurs**.'
            : 'Les changements s’appliquent sur **ce serveur uniquement**.')
        .addFields(
            { name: 'Nom', value: values.name, inline: true },
            { name: 'Photo', value: values.avatar, inline: true },
            { name: 'Bannière', value: values.banner, inline: true },
            { name: 'Bio', value: String(values.bio).slice(0, 1024) },
        )
        .setThumbnail(values.thumbnail)
        .setFooter({ text: 'Le panneau se ferme après 10 minutes.' });
    if (values.image) embed.setImage(values.image);
    if (notice) embed.addFields({ name: 'Dernière action', value: notice.slice(0, 1024) });
    return embed;
}

function rows(id, scope, disabled = false, canGlobal = false) {
    const button = (key, label, style = ButtonStyle.Primary) => new ButtonBuilder()
        .setCustomId(`${id}:${key}`).setLabel(label).setStyle(style).setDisabled(disabled);
    return [
        new ActionRowBuilder().addComponents(
            button('name', 'Nom'), button('avatar', 'Photo'), button('banner', 'Bannière'), button('bio', 'Bio'),
        ),
        new ActionRowBuilder().addComponents(
            ...(canGlobal ? [button('scope', scope === 'global' ? 'Passer à : ce serveur' : 'Passer à : tous les serveurs', ButtonStyle.Secondary)] : []),
            ...(scope === 'guild' ? [button('reset', 'Retirer la personnalisation', ButtonStyle.Danger)] : []),
            button('close', 'Fermer', ButtonStyle.Secondary),
        ),
    ];
}

function modal(id, key, scope) {
    const field = FIELDS[key];
    const isImage = key === 'avatar' || key === 'banner';
    const input = new TextInputBuilder()
        .setCustomId('value')
        .setLabel(isImage ? `Lien de l'image (${field.label.toLowerCase()})` : field.label)
        .setStyle(key === 'bio' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(scope === 'global' && key !== 'bio')
        .setMaxLength(key === 'name' ? 32 : key === 'bio' ? 190 : 400);
    const hint = isImage ? (scope === 'guild' ? 'https://…  (vide = revenir au profil global)' : 'https://…')
        : scope === 'guild' ? 'Laisse vide pour revenir au profil global' : null;
    if (hint) input.setPlaceholder(hint);
    return new ModalBuilder()
        .setCustomId(`${id}:modal:${key}`)
        .setTitle(`${field.label} (${scope === 'global' ? 'tous les serveurs' : 'ce serveur'})`)
        .addComponents(new ActionRowBuilder().addComponents(input));
}

async function openPanel(client, message) {
    const id = `setp:${message.id}`;
    // Par défaut : seulement ce serveur. « Tous les serveurs » : propriétaires du bot uniquement.
    let scope = 'guild';
    const canGlobal = Permissions.isBotOwner(client, message.author.id);
    const show = async notice => render(await readProfile(client, message.guild), scope, notice);
    const panel = await message.channel.send({ embeds: [await show()], components: rows(id, scope, false, canGlobal), allowedMentions: { parse: [] } });

    const collector = panel.createMessageComponentCollector({ time: PANEL_TTL });
    collector.on('collect', async interaction => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: 'Seule la personne qui a ouvert ce panneau peut l\'utiliser.', flags: 64 }).catch(() => {});
        }
        const key = interaction.customId.slice(id.length + 1);
        try {
            if (key === 'close') {
                collector.stop('close');
                return interaction.update({ embeds: [await show('Panneau fermé.')], components: rows(id, scope, true, canGlobal) });
            }
            if (key === 'scope') {
                if (!canGlobal) return;
                scope = scope === 'global' ? 'guild' : 'global';
                return interaction.update({ embeds: [await show()], components: rows(id, scope, false, canGlobal) });
            }
            if (key === 'reset') {
                await interaction.deferUpdate();
                let notice = 'Personnalisation de ce serveur retirée : le profil global s\'affiche.';
                await message.guild.members.editMe({ nick: null, avatar: null, banner: null, bio: null })
                    .catch(err => { notice = describeError(err); });
                return panel.edit({ embeds: [await show(notice)], components: rows(id, scope, false, canGlobal) });
            }
            if (!FIELDS[key]) return;

            await interaction.showModal(modal(id, key, scope));
            const submitted = await interaction.awaitModalSubmit({
                time: 5 * 60 * 1000,
                filter: i => i.customId === `${id}:modal:${key}` && i.user.id === message.author.id,
            }).catch(() => null);
            if (!submitted) return;
            await submitted.deferUpdate();
            const value = submitted.fields.getTextInputValue('value').trim();
            let notice;
            try {
                notice = await applyField(client, message.guild, key, value, scope);
            } catch (err) {
                notice = err instanceof Error && !err.code ? err.message : describeError(err);
            }
            return panel.edit({ embeds: [await show(notice)], components: rows(id, scope, false, canGlobal) });
        } catch (err) {
            if (err?.code === 10062 || err?.code === 40060) return;
            await interaction.followUp({ content: describeError(err), flags: 64 }).catch(() => {});
        }
    });
    collector.on('end', (_, reason) => {
        if (reason !== 'close') panel.edit({ components: rows(id, scope, true, canGlobal) }).catch(() => {});
    });
}

// ─── Commande ────────────────────────────────────────────────────

module.exports = {
    name: 'set',
    category: 'config',
    permissions: ['ManageGuild'],
    description: 'Change le profil du bot sur ce serveur : nom, photo, bannière et bio',
    usage: '[name/pic/banner/bio/profil] [valeur] | global <...> (propriétaires du bot)',
    async run(client, message, args) {
        // « +set global name … » : sur tous les serveurs (propriétaires du bot). Sinon : ce serveur.
        const isGlobal = args[0]?.toLowerCase() === 'global';
        if (isGlobal && !Permissions.isBotOwner(client, message.author.id)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Seuls les propriétaires du bot peuvent changer son profil sur tous les serveurs. Sans « global », le changement ne touche que ce serveur.')] });
        }
        if (isGlobal) args = args.slice(1);
        const scope = isGlobal ? 'global' : 'guild';
        const where = isGlobal ? 'tous les serveurs' : 'ce serveur';
        const sub = args[0]?.toLowerCase();
        const value = args.slice(1).join(' ').trim();
        const prefix = message.guildSettings?.prefix || client.prefix;
        const reply = text => message.channel.send({ embeds: [EmbedHelper.success(text)] });
        const fail = text => message.channel.send({ embeds: [EmbedHelper.error(text)] });
        const run = async (key, val) => {
            try {
                return reply(await applyField(client, message.guild, key, val, scope));
            } catch (err) {
                return fail(err instanceof Error && !err.code ? err.message : describeError(err));
            }
        };

        // Raccourcis texte (ce serveur, ou tous avec « global »). Sans argument : le panneau.
        if (sub === 'name') return run('name', value);
        if (sub === 'pic' || sub === 'avatar') return run('avatar', value || message.attachments.first()?.url);
        if (sub === 'banner') return run('banner', value || message.attachments.first()?.url);
        if (sub === 'bio') return run('bio', value);

        if (sub === 'profil') {
            const [name, avatar, banner] = value.split(',,').map(s => s.trim());
            if (!name && !avatar && !banner) {
                return fail(`Usage : \`${prefix}set profil <nom> ,, <lien photo> ,, <lien bannière>\` (laisse une partie vide pour ne pas la changer)`);
            }
            if ([avatar, banner].some(link => link && !HTTPS_LINK.test(link))) {
                return fail('Les liens de photo et de bannière doivent commencer par https://.');
            }
            try {
                if (isGlobal) {
                    const data = {};
                    const fields = [];
                    if (name) { data.username = name; fields.push('nick'); }
                    if (avatar) { data.avatar = avatar; fields.push('avatar'); }
                    if (banner) { data.banner = banner; fields.push('banner'); }
                    await client.user.edit(data);
                    await syncAllGuilds(client, fields).catch(() => 0);
                } else {
                    const data = {};
                    if (name) data.nick = name;
                    if (avatar) data.avatar = avatar;
                    if (banner) data.banner = banner;
                    await message.guild.members.editMe(data);
                }
                return reply(`Profil du bot mis à jour sur ${where}.`);
            } catch (err) {
                return fail(describeError(err));
            }
        }

        if (sub) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Option inconnue. Tape \`${prefix}set\` pour ouvrir le panneau, ou \`${prefix}set name/pic/banner/bio <valeur>\`.`)] });
        }
        return openPanel(client, message);
    },
};
