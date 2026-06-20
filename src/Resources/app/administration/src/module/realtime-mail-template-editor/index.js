import './page/realtime-mail-template-editor';

import enGB from './snippet/en-GB.json';
import deDE from './snippet/de-DE.json';

const { Module } = Shopware;

Module.register('realtime-mail-template-editor', {
    type: 'plugin',
    name: 'realtime-mail-template-editor',
    title: 'realtime-mail-template-editor.general.title',
    description: 'realtime-mail-template-editor.general.description',
    color: '#1f7a64',
    icon: 'regular-envelope',

    snippets: {
        'en-GB': enGB,
        'de-DE': deDE,
    },

    routes: {
        index: {
            component: 'realtime-mail-template-editor',
            path: 'index',
            meta: {
                parentPath: 'sw.settings.index',
                privilege: 'realtime_mail_template_editor.viewer',
            },
        },
    },

    navigation: [{
        id: 'realtime-mail-template-editor',
        label: 'realtime-mail-template-editor.navigation.main',
        color: '#1f7a64',
        icon: 'regular-envelope',
        path: 'realtime.mail.template.editor.index',
        parent: 'sw-settings',
        position: 95,
        privilege: 'realtime_mail_template_editor.viewer',
    }],

    settingsItem: [{
        group: 'plugins',
        to: 'realtime.mail.template.editor.index',
        icon: 'regular-envelope',
        privilege: 'realtime_mail_template_editor.viewer',
    }],
});
