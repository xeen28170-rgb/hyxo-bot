'use strict';

const axios = require('axios');
const Logger = require('../utils/logger');
const TwitchAlert = require('../models/TwitchAlert');
const { EmbedBuilder } = require('discord.js');

const TwitchService = {
    async getAccessToken() {
        if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return null;
        try {
            const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
                params: {
                    client_id: process.env.TWITCH_CLIENT_ID,
                    client_secret: process.env.TWITCH_CLIENT_SECRET,
                    grant_type: 'client_credentials'
                }
            });
            return response.data.access_token;
        } catch (error) {
            Logger.error('Twitch Auth Error:', error.message);
            return null;
        }
    },

    async getStreamInfo(username) {
        const token = await this.getAccessToken();
        if (!token) return null;

        try {
            const response = await axios.get(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${token}`
                }
            });
            return response.data.data[0] || null;
        } catch (error) {
            Logger.error('Twitch API Error:', error.message);
            return null;
        }
    },

    /**
     * Vérifier tous les streamers enregistrés et envoyer les alertes
     */
    async processAlerts(client) {
        const alerts = await TwitchAlert.find();
        if (!alerts.length) return;

        const streamerNames = [...new Set(alerts.map(a => a.streamerName))];
        
        for (const streamer of streamerNames) {
            const streamInfo = await this.getStreamInfo(streamer);
            const streamerAlerts = alerts.filter(a => a.streamerName === streamer);

            if (streamInfo) {
                for (const alert of streamerAlerts) {
                    if (alert.lastLiveId !== streamInfo.id) {
                        const guild = client.guilds.cache.get(alert.guildId);
                        if (!guild) continue;

                        const channel = guild.channels.cache.get(alert.channelId);
                        if (!channel) continue;

                        const embed = new EmbedBuilder()
                            .setColor(0x9146FF)
                            .setTitle(`💜 ${streamInfo.user_name} est en live !`)
                            .setURL(`https://twitch.tv/${streamInfo.user_login}`)
                            .setDescription(alert.message
                                .replace('{streamer}', streamInfo.user_name)
                                .replace('{title}', streamInfo.title)
                                .replace('{game}', streamInfo.game_name || 'Inconnu')
                            )
                            .addFields(
                                { name: '🎮 Jeu', value: streamInfo.game_name || 'Aucun', inline: true },
                                { name: '👥 Viewers', value: streamInfo.viewer_count.toString(), inline: true }
                            )
                            .setImage(streamInfo.thumbnail_url.replace('{width}', '1280').replace('{height}', '720') + `?t=${Date.now()}`)
                            .setTimestamp();

                        await channel.send({ embeds: [embed] }).catch(() => {});
                        
                        await TwitchAlert.updateOne({ _id: alert._id }, { 
                            lastLiveId: streamInfo.id,
                            isLive: true 
                        });
                    }
                }
            } else {
                await TwitchAlert.updateMany({ streamerName: streamer, isLive: true }, { isLive: false });
            }
        }
    }
};

module.exports = TwitchService;
