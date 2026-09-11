'use strict';

const SecurityPanel = require('../../utils/securityPanel');

module.exports = {
    name: 'secur',
    aliases: [
        'security',
        'securitypanel',
        'antiraid',
        'antichannel',
        'antirole',
        'antiwebhook',
        'antibot',
        'antiban',
        'antikick',
        'antiunban',
        'antiupdate',
        'antitoken',
        'antieveryone',
        'antideco',
        'punition',
    ],
    category: 'automod',
    description: 'Ouvre la console sécurité unifiée.',
    usage: '-secur',
    permissions: ['Administrator'],
    botPermissions: ['ManageRoles', 'ViewAuditLog'],
    async run(client, message) {
        return SecurityPanel.open(client, message);
    },
};
