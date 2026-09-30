
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

const Logger = {
    info: (message, meta) => winstonLogger.info(message, meta),
    warn: (message, meta) => winstonLogger.warn(message, meta),
    error: (message, meta) => winstonLogger.error(message, meta),
    debug: (message, meta) => {
        if (process.env.DEBUG === 'true') {
            winstonLogger.debug(message, meta);
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
        console.log(chalk.cyan.bold(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║    ██████╗ ███████╗███████╗████████╗██╗ ██████╗ ███╗   ██╗ ║
║   ██╔════╝ ██╔════╝██╔════╝╚══██╔══╝██║██╔═══██╗████╗  ██║ ║
║   ██║  ███╗█████╗  ███████╗   ██║   ██║██║   ██║██╔██╗ ██║ ║
║   ██║   ██║██╔══╝  ╚════██║   ██║   ██║██║   ██║██║╚██╗██║ ║
║   ╚██████╔╝███████╗███████║   ██║   ██║╚██████╔╝██║ ╚████║ ║
║    ╚═════╝ ╚══════╝╚══════╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ║
║                                                   ║
║         Bot Discord Professionnel v2.0.0          ║
║              Open Source Discord Bot              ║
╚═══════════════════════════════════════════════════╝
        `));
    },
};

module.exports = Logger;
