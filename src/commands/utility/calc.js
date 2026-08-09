'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

function tokenize(expression) {
    const sanitized = expression.replace(/\s+/g, '');
    if (!sanitized) return [];
    if (!/^[\d+\-*/().,]+$/.test(sanitized)) {
        throw new Error('Caractères invalides');
    }

    const tokens = [];
    let current = '';
    for (let i = 0; i < sanitized.length; i++) {
        const char = sanitized[i];
        const prev = sanitized[i - 1];
        const isUnaryMinus = char === '-'
            && (i === 0 || '+-*/('.includes(prev))
            && /\d|\./.test(sanitized[i + 1] || '');

        if (/\d|\./.test(char) || isUnaryMinus) {
            current += char;
            continue;
        }

        if (current) {
            tokens.push(current.replace(',', '.'));
            current = '';
        }

        if ('+-*/()'.includes(char)) {
            tokens.push(char);
            continue;
        }

        throw new Error('Jeton invalide');
    }

    if (current) tokens.push(current.replace(',', '.'));
    return tokens;
}

function precedence(operator) {
    return operator === '+' || operator === '-' ? 1 : 2;
}

function applyOperator(values, operator) {
    if (values.length < 2) throw new Error('Expression invalide');
    const right = values.pop();
    const left = values.pop();

    switch (operator) {
        case '+':
            values.push(left + right);
            break;
        case '-':
            values.push(left - right);
            break;
        case '*':
            values.push(left * right);
            break;
        case '/':
            if (right === 0) throw new Error('Division par zéro');
            values.push(left / right);
            break;
        default:
            throw new Error('Opérateur invalide');
    }
}

function evaluateExpression(expression) {
    const tokens = tokenize(expression);
    if (!tokens.length) throw new Error('Expression vide');

    const values = [];
    const operators = [];

    for (const token of tokens) {
        if (!Number.isNaN(Number(token))) {
            values.push(Number(token));
            continue;
        }

        if (token === '(') {
            operators.push(token);
            continue;
        }

        if (token === ')') {
            while (operators.length && operators[operators.length - 1] !== '(') {
                applyOperator(values, operators.pop());
            }
            if (operators.pop() !== '(') throw new Error('Parenthèses invalides');
            continue;
        }

        while (
            operators.length
            && operators[operators.length - 1] !== '('
            && precedence(operators[operators.length - 1]) >= precedence(token)
        ) {
            applyOperator(values, operators.pop());
        }
        operators.push(token);
    }

    while (operators.length) {
        const operator = operators.pop();
        if (operator === '(') throw new Error('Parenthèses invalides');
        applyOperator(values, operator);
    }

    if (values.length !== 1 || !Number.isFinite(values[0])) {
        throw new Error('Résultat invalide');
    }

    return values[0];
}

module.exports = {
    name: 'calc',
    category: 'utility',
    description: 'Permet de résoudre des calculs ou des équations',
    usage: '<calcul>',
    async run(client, message, args) {
        const expression = args.join(' ');
        if (!expression) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez fournir un calcul.')] });

        try {
            const result = evaluateExpression(expression);
            await message.channel.send({ embeds: [EmbedHelper.success(`🧨 Résultat : **${result}**`)] });
        } catch {
            await message.channel.send({ embeds: [EmbedHelper.error('Calcul invalide.')] });
        }
    },
};
