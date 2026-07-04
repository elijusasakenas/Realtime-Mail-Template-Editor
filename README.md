# Realtime Mail Template Editor

Open-source Shopware 6 plugin concept for store owners and managers who need to make small mail-template edits without jumping between editor and preview screens.

## MVP

- Adds a Shopware Administration settings module.
- Loads existing `mail_template` records with their template type.
- Lets permitted admins edit subject, sender name, HTML content, and plain text content.
- Renders a live HTML preview while typing.
- Saves changes through Shopware's `mail_template` repository.
- Uses ACL roles for viewer/editor access.

## Install In A Local Shop

This repository is the plugin root. For local development, place or symlink it into a Shopware installation:

```bash
ln -s "$PWD" /path/to/shopware/custom/plugins/RealtimeMailTemplateEditor
cd /path/to/shopware
bin/console plugin:refresh
bin/console plugin:install --activate RealtimeMailTemplateEditor
bin/console cache:clear
bin/build-administration.sh
```

The module appears under **Settings > Plugins > Realtime email editor**.

## Local Shop Option

If there is no Shopware installation yet, this repo includes a Dockware setup that mounts the plugin into a new local shop:

```bash
docker compose up -d
docker compose exec shopware bash
bin/console plugin:refresh
bin/console plugin:install --activate RealtimeMailTemplateEditor
bin/console cache:clear
bin/build-administration.sh
```

Then open `http://localhost/admin`.

## Product Direction

The current version proves the workflow. Good next steps:

- Add richer fake-data profiles for order, account, password reset, and document mails.
- Add device-size preview controls.
- Add undo/reset to last saved version.
- Add guardrails for non-technical users, such as editable text blocks extracted from HTML.
- Add template backup snapshots before saving.
