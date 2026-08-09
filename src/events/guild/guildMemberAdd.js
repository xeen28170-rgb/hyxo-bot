'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const AntiraidService = require('../../services/antiraidService');
const LogDispatcher = require('../../utils/logDispatcher');
const Logger = require('../../utils/logger');
const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'guildMemberAdd',
    async run(client, member) {
        try {
            const guild = member.guild;

            const settings = await getGuildSettings(client, guild.id);

            if (settings?.antiraid?.enabled) {
                await AntiraidService.handleMemberJoin(client, member, settings);
            }

            scheduleStatsUpdate(client, guild, 'member_add', 15_000);

            if (settings?.welcome?.autorole) {
                const role = guild.roles.cache.get(settings.welcome.autorole);
                if (role) await member.roles.add(role).catch(() => {});
            }

            if (settings?.welcome?.roles?.length) {
                for (const roleId of settings.welcome.roles) {
                    const role = guild.roles.cache.get(roleId);
                    if (role) await member.roles.add(role).catch(() => {});
                }
            }

            const joinEmbed = EmbedHelper.info('📥 Arrivée d\'un membre', [
                `**Utilisateur:** ${member.user} (\`${member.id}\`)`,
                `**Pseudo:** ${member.user.username}`,
                `**Création du compte:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
                `**Nombre total de membres:** \`${guild.memberCount}\``,
                '',
                `> *Bienvenue sur ${guild.name} !*`
            ].join('\n'), { color: 0x57F287 })
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `ID: ${member.id}`, iconURL: guild.iconURL() })
                .setTimestamp();
            await LogDispatcher.join(guild, joinEmbed);

            if (settings?.welcome?.enabled && settings?.welcome?.channel) {
                const welcomeChannel = guild.channels.cache.get(settings.welcome.channel);
                if (welcomeChannel) {
                    let msgContent = null;
                    if (settings.welcome.message) {
                        msgContent = settings.welcome.message
                            .replace('{user}', `<@${member.id}>`)
                            .replace('{server}', guild.name)
                            .replace('{memberCount}', guild.memberCount);
                    }

                    const { createCanvas, loadImage } = require('@napi-rs/canvas');
                    const { AttachmentBuilder } = require('discord.js');

                    const canvas = createCanvas(1100, 500);
                    const ctx = canvas.getContext('2d');

                    drawWelcomeBackground(ctx, canvas.width, canvas.height);

                    drawFittedText(ctx, 'BIENVENUE', {
                        x: canvas.width / 2,
                        y: 290,
                        maxWidth: canvas.width - 160,
                        maxSize: 58,
                        minSize: 36,
                        weight: 'bold',
                        color: '#FFFFFF',
                    });

                    drawFittedText(ctx, `SUR ${guild.name.toUpperCase()}`, {
                        x: canvas.width / 2,
                        y: 337,
                        maxWidth: canvas.width - 180,
                        maxSize: 34,
                        minSize: 22,
                        weight: 'bold',
                        color: '#CBD5E1',
                    });

                    drawFittedText(ctx, member.user.tag.toUpperCase(), {
                        x: canvas.width / 2,
                        y: 378,
                        maxWidth: canvas.width - 220,
                        maxSize: 38,
                        minSize: 24,
                        weight: 'bold',
                        color: '#7289DA',
                    });

                    drawCenteredPill(ctx, `MEMBRE #${guild.memberCount}`, canvas.width / 2, 440);

                    // Avatar
                    const avatarSize = 170;
                    const avatarX = canvas.width / 2 - avatarSize / 2;
                    const avatarY = 58;

                    ctx.save();
                    ctx.shadowColor = 'rgba(88, 101, 242, 0.45)';
                    ctx.shadowBlur = 28;
                    ctx.beginPath();
                    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 12, 0, Math.PI * 2, true);
                    ctx.fillStyle = '#111827';
                    ctx.fill();
                    ctx.restore();

                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
                    ctx.closePath();
                    ctx.clip();

                    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });
                    const avatar = await loadImage(avatarUrl).catch(() => null);
                    if (avatar) {
                        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
                    } else {
                        ctx.fillStyle = '#7289DA';
                        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
                        drawFittedText(ctx, member.user.username.slice(0, 2).toUpperCase(), {
                            x: canvas.width / 2,
                            y: avatarY + 108,
                            maxWidth: avatarSize - 30,
                            maxSize: 58,
                            minSize: 34,
                            weight: 'bold',
                            color: '#FFFFFF',
                        });
                    }
                    
                    ctx.restore();

                    // Bordure Avatar
                    ctx.beginPath();
                    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
                    ctx.lineWidth = 10;
                    const avatarBorder = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
                    avatarBorder.addColorStop(0, '#60A5FA');
                    avatarBorder.addColorStop(0.45, '#7289DA');
                    avatarBorder.addColorStop(1, '#F43F5E');
                    ctx.strokeStyle = avatarBorder;
                    ctx.stroke();

                    const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'welcome.png' });

                    await welcomeChannel.send({
                        content: msgContent || `<@${member.id}>`,
                        files: [attachment]
                    }).catch(() => {});
                }
            }

        } catch (err) {
            Logger.error('[guildMemberAdd] Erreur:', { message: err.message, stack: err.stack });
        }
    },
};

function drawWelcomeBackground(ctx, width, height) {
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#111827');
    background.addColorStop(0.55, '#1F2937');
    background.addColorStop(1, '#0F172A');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const topAccent = ctx.createLinearGradient(0, 0, width, 0);
    topAccent.addColorStop(0, '#F43F5E');
    topAccent.addColorStop(0.5, '#7289DA');
    topAccent.addColorStop(1, '#60A5FA');
    ctx.fillStyle = topAccent;
    ctx.fillRect(0, 0, width, 8);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    for (let x = -height; x < width; x += 86) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + height, height);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.9;
    drawRoundedRect(ctx, 66, 58, width - 132, height - 108, 28);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawCenteredPill(ctx, text, centerX, y) {
    const label = String(text || '').toUpperCase();
    ctx.font = 'bold 22px sans-serif';
    const width = Math.min(ctx.measureText(label).width + 54, 360);
    const height = 42;
    const x = centerX - width / 2;

    const gradient = ctx.createLinearGradient(x, y - height + 6, x + width, y);
    gradient.addColorStop(0, '#2563EB');
    gradient.addColorStop(1, '#E11D48');

    drawRoundedRect(ctx, x, y - height + 6, width, height, 21);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, centerX, y - height / 2 + 6);
    ctx.textBaseline = 'alphabetic';
}

function drawFittedText(ctx, text, options) {
    const {
        x,
        y,
        maxWidth,
        maxSize,
        minSize,
        weight = 'normal',
        color = '#FFFFFF',
        family = 'sans-serif',
    } = options;

    let output = String(text || '').replace(/\s+/g, ' ').trim();
    let size = maxSize;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;

    while (size > minSize) {
        ctx.font = `${weight} ${size}px ${family}`;
        if (ctx.measureText(output).width <= maxWidth) break;
        size -= 2;
    }

    ctx.font = `${weight} ${size}px ${family}`;
    while (ctx.measureText(output).width > maxWidth && output.length > 4) {
        output = `${output.slice(0, -4).trimEnd()}...`;
    }

    ctx.fillText(output, x, y);
}
