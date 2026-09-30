'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { expireMenu } = require('./menuLifetime');
const context = new AsyncLocalStorage();
const EXAMPLES = {
    delowner: 'delowner @Utilisateur', addrole: 'addrole @Utilisateur @Rôle',
    delrole: 'delrole @Utilisateur @Rôle', ban: 'ban @Utilisateur raison',
    kick: 'kick @Utilisateur raison', timeout: 'timeout @Utilisateur 10m raison',
    laisse: 'laisse @Utilisateur', unlaisse: 'unlaisse @Utilisateur',
    acces: 'acces @Utilisateur', owner: 'owner add @Utilisateur',
    backup: 'backup list', clear: 'clear 10', pv: 'pv',
};

function presentationMessage(message, command) {
    const temporary = ['help', 'embed', 'join-settings'].includes(command.name);
    if (!temporary) return message;
    const wrap = async (send, args) => {
        const reply = await send(...args);
        if (reply.components?.length) expireMenu(reply);
        return reply;
    };
    const channel = new Proxy(message.channel, { get(target, key) {
        if (key === 'send') return (...args) => wrap(target.send.bind(target), args);
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
    } });
    const wrapped = Object.create(message);
    Object.defineProperty(wrapped, 'channel', { value: channel });
    Object.defineProperty(wrapped, 'reply', { value: (...args) => wrap(message.reply.bind(message), args) });
    return wrapped;
}

module.exports = { context, EXAMPLES, presentationMessage };
