
'use strict';

const winston = require('winston');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs-extra');
require('winston-daily-rotate-file');

const logsDir = path.join(process.cwd(), 'logs');
fs.ensureDirSync(logsDir);

const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        // Sanitisation anti log-forging : les nouvelles lignes dans les messages
        // (pseudos, contenus utilisateur…) sont repliées sur la console pour éviter
        // qu'un attaquant ne forge des lignes de log falsifiées.
        const safeMessage = String(message ?? '').replace(/[\r\n]+/g, ' ');
        const metaStr = Object.keys(meta).length ? '\n' + JSON.stringify(meta, (k, v) =>
            typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ') : v, 2) : '';

        switch (level) {
            case 'error':
                return `${chalk.gray(`[${timestamp}]`)} ${chalk.red.bold('[ERROR]')} ${chalk.red(safeMessage)}${metaStr}`;
            case 'warn':
                return `${chalk.gray(`[${timestamp}]`)} ${chalk.yellow.bold('[WARN]')} ${chalk.yellow(safeMessage)}${metaStr}`;
            case 'info':
                return `${chalk.gray(`[${timestamp}]`)} ${chalk.cyan.bold('[INFO]')} ${chalk.white(safeMessage)}${metaStr}`;
            case 'debug':
                return `${chalk.gray(`[${timestamp}]`)} ${chalk.magenta.bold('[DEBUG]')} ${chalk.magenta(safeMessage)}${metaStr}`;
            default:
                return `${chalk.gray(`[${timestamp}]`)} ${chalk.green.bold('[LOG]')} ${chalk.white(safeMessage)}${metaStr}`;
        }
    })
);

const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const winstonLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: [
        new winston.transports.Console({
            format: consoleFormat,
        }),
        new winston.transports.DailyRotateFile({
            filename: path.join(logsDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            format: fileFormat,
            maxFiles: '30d',
            maxSize: '20m',
        }),
        new winston.transports.DailyRotateFile({
            filename: path.join(logsDir, 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            format: fileFormat,
            maxFiles: '14d',
            maxSize: '50m',
        }),
    ],
});

// winston ignore un second argument qui n'est pas un objet : Logger.error('[X]', err.message)
// affichait donc « [X] » seul. On recolle ce détail au message.
function log(level, message, meta) {
    if (level === 'error' && isNetworkError(message, meta)) return logNetworkError(message, meta);
    if (meta !== undefined && (meta === null || typeof meta !== 'object')) {
        return winstonLogger[level](`${message} ${meta}`);
    }
    return winstonLogger[level](message, meta);
}

// Coupure réseau de l'hébergeur (DNS, connexion à discord.com) : chaque commande, log
// ou tâche planifiée échoue en même temps. On les regroupe en un avertissement par minute.
const NETWORK_ERROR = /EAI_AGAIN|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|ENETUNREACH|EHOSTUNREACH|UND_ERR_|Connect Timeout Error|operation was aborted|socket hang up|other side closed/i;
const NETWORK_WINDOW = 60_000;
let networkBurst = null;

function isNetworkError(message, meta) {
    const detail = meta instanceof Error ? `${meta.code || ''} ${meta.message}` : typeof meta === 'object' ? meta?.message : meta;
    return NETWORK_ERROR.test(String(detail ?? '')) || NETWORK_ERROR.test(String(message ?? ''));
}

function logNetworkError(message, meta) {
    const now = Date.now();
    if (networkBurst && now - networkBurst.start < NETWORK_WINDOW) {
        networkBurst.count++;
        return;
    }
    if (networkBurst?.count) {
        winstonLogger.warn(`[Réseau] ${networkBurst.count} autre(s) erreur(s) réseau masquée(s) pendant la dernière minute.`);
    }
    networkBurst = { start: now, count: 0 };
    const detail = meta instanceof Error ? meta.message : typeof meta === 'object' ? meta?.message : meta;
    winstonLogger.warn(`[Réseau] Discord injoignable depuis l'hébergeur (${String(detail ?? message).slice(0, 120)}). Vérifiez la connexion / le DNS du serveur. Erreurs similaires regroupées pendant 1 min.`);
}

const Logger = {
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta),
    debug: (message, meta) => {
        if (process.env.DEBUG === 'true') {
            log('debug', message, meta);
        }
    },
    success: (message) => {
        const timestamp = new Date().toLocaleString('fr-FR');
        console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.green.bold('[SUCCESS]')} ${chalk.green(message)}`);
    },
    cmd: (message) => {
        const timestamp = new Date().toLocaleString('fr-FR');
        console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.blue.bold('[CMD]')} ${chalk.white(message)}`);
    },
    event: (message) => {
        const timestamp = new Date().toLocaleString('fr-FR');
        console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.cyan.bold('[EVENT]')} ${chalk.white(message)}`);
    },
    db: (message) => {
        const timestamp = new Date().toLocaleString('fr-FR');
        console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.magenta.bold('[DB]')} ${chalk.white(message)}`);
    },
    banner: () => {
        // Caractères ASCII simples et cadre calculé : l'alignement tient dans toutes les
        // consoles (Pterodactyl, PM2, Windows), contrairement aux blocs Unicode.
        const { name } = require('../config/brand');
        const { version } = require('../../package.json');
        const art = [
            ' _   ___   ____  __  ___  ',
            '| | | \\ \\ / /\\ \\/ / / _ \\ ',
            '| |_| |\\ V /  \\  / | | | |',
            '|  _  | | |   /  \\ | |_| |',
            '|_| |_| |_|  /_/\\_\\ \\___/ ',
        ];
        const info = [`${name} v${version}`, 'Bot Discord de sécurité et de gestion', `Node ${process.version}`];
        const width = Math.max(...art.map(l => l.length), ...info.map(l => l.length)) + 6;
        const center = text => {
            const left = Math.floor((width - text.length) / 2);
            return ' '.repeat(left) + text + ' '.repeat(width - text.length - left);
        };
        const line = '+' + '-'.repeat(width) + '+';
        const out = [
            line,
            '|' + ' '.repeat(width) + '|',
            ...art.map(l => '|' + chalk.cyan(center(l)) + '|'),
            '|' + ' '.repeat(width) + '|',
            ...info.map((l, i) => '|' + (i === 0 ? chalk.bold(center(l)) : chalk.gray(center(l))) + '|'),
            '|' + ' '.repeat(width) + '|',
            line,
        ];
        console.log('\n' + out.join('\n') + '\n');
    },
};

module.exports = Logger;
