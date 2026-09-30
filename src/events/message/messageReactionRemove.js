'use strict';

const add = require('./messageReactionAdd');
module.exports = { name: 'messageReactionRemove', run: add.run };
