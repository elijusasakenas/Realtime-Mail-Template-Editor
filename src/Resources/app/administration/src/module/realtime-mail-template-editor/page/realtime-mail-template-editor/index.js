import template from './realtime-mail-template-editor.html.twig';
import './realtime-mail-template-editor.scss';

const { Component, Mixin } = Shopware;
const { Criteria } = Shopware.Data;

Component.register('realtime-mail-template-editor', {
    template,

    inject: [
        'repositoryFactory',
        'entityMappingService',
        'acl',
    ],

    mixins: [
        Mixin.getByName('notification'),
    ],

    data() {
        return {
            templates: null,
            selectedTemplateId: null,
            selectedTemplate: null,
            preview: {
                subject: '',
                senderName: '',
                contentHtml: '',
                contentPlain: '',
            },
            renderError: null,
            isLoading: false,
            isRendering: false,
            isSaveSuccessful: false,
            renderDebounce: null,
            variableSearchTerm: '',
            activeVariableGroup: 'all',
            customFields: [],
            previewTab: 'html',
            previewDevice: 'desktop',
            previewEdit: {
                originalText: '',
                replacementText: '',
                matchedSource: '',
                matchStart: -1,
                matchLength: 0,
                matchType: '',
            },
            editorConfig: {
                enableBasicAutocompletion: true,
                enableLiveAutocompletion: true,
            },
        };
    },

    metaInfo() {
        return {
            title: this.$createTitle(this.$tc('realtime-mail-template-editor.general.title')),
        };
    },

    computed: {
        mailTemplateRepository() {
            return this.repositoryFactory.create('mail_template');
        },

        mailTemplateTypeRepository() {
            return this.repositoryFactory.create('mail_template_type');
        },

        customFieldRepository() {
            return this.repositoryFactory.create('custom_field');
        },

        httpClient() {
            return Shopware.Application.getContainer('init').httpClient;
        },

        mailTemplateCriteria() {
            const criteria = new Criteria(1, 25);
            criteria.addAssociation('mailTemplateType');
            criteria.addSorting(Criteria.sort('description', 'ASC'));

            return criteria;
        },

        canEdit() {
            return this.acl.can('realtime_mail_template_editor.editor');
        },

        availableVariables() {
            const variables = new Map();

            const templateData = this.selectedTemplate?.mailTemplateType?.templateData || {};
            this.flattenTemplateData(templateData).forEach((path) => {
                this.addVariable(variables, path, 'templateData');
            });

            this.getEntityMappingVariables().forEach((path) => {
                this.addVariable(variables, path, 'entity');
            });

            this.getCustomFieldVariables().forEach((path) => {
                this.addVariable(variables, path, 'customField');
            });

            return Array.from(variables.values()).sort((first, second) => {
                return first.value.localeCompare(second.value);
            });
        },

        variableGroups() {
            const counts = new Map();

            this.availableVariables.forEach((variable) => {
                counts.set(variable.group, (counts.get(variable.group) || 0) + 1);
            });

            return [
                {
                    value: 'all',
                    label: `${this.$tc('realtime-mail-template-editor.variables.groupAll')} (${this.availableVariables.length})`,
                },
                ...Array.from(counts.entries())
                    .sort(([first], [second]) => first.localeCompare(second))
                    .map(([value, count]) => ({
                        value,
                        label: `${this.formatVariableGroupLabel(value)} (${count})`,
                    })),
            ];
        },

        filteredVariables() {
            // Every whitespace-separated search word has to match somewhere in the
            // variable, so "order custom" finds order.customFields.* entries.
            const terms = this.variableSearchTerm
                .trim()
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean);

            return this.availableVariables.filter((variable) => {
                const matchesGroup = this.activeVariableGroup === 'all' || variable.group === this.activeVariableGroup;

                if (!matchesGroup) {
                    return false;
                }

                if (terms.length === 0) {
                    return true;
                }

                const haystack = `${variable.label} ${variable.value} ${variable.example}`.toLowerCase();

                return terms.every((term) => haystack.includes(term));
            });
        },

        hasPreviewEditSelection() {
            return this.previewEdit.originalText.trim().length > 0;
        },

        hasSourceMatch() {
            return this.previewEdit.matchStart >= 0;
        },

        previewSampleValues() {
            // Mirrors the sample data in MailTemplatePreviewController::getPreviewData(),
            // longest first so bigger values are masked before their substrings.
            return [
                'https://example.com/account/recover',
                'alex.miller@example.com',
                'demo-order-link-10042',
                'Ceramic Coffee Cup',
                'Standard shipping',
                'Everyday Backpack',
                'https://example.com',
                'Miller Studio',
                'Credit card',
                'Demo Store',
                'Dear Alex',
                '10042',
                '149.9',
                '125.97',
                '89.95',
                '59.95',
                '29.98',
                'Miller',
                'Alex',
                'EUR',
            ];
        },

        completerFunction() {
            return (prefix) => {
                const mappedVariables = this.selectedTemplate?.mailTemplateType?.availableEntities
                    ? Object.keys(this.entityMappingService.getEntityMapping(
                        prefix,
                        this.selectedTemplate.mailTemplateType.availableEntities,
                    )).map((value) => ({ value }))
                    : [];

                const helperVariables = this.availableVariables.map((variable) => ({
                    value: variable.value,
                }));

                return [
                    ...mappedVariables,
                    ...helperVariables,
                ];
            };
        },

        previewDocument() {
            const body = this.preview.contentHtml || this.emptyPreviewHtml;

            return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { margin: 0; padding: 24px; color: #1f2933; font-family: Arial, sans-serif; background: #ffffff; }
        img { max-width: 100%; height: auto; }
        table { max-width: 100%; }
        body * { cursor: text; }
        body *:hover { outline: 1px dashed #189eff; outline-offset: 3px; }
        [contenteditable="true"] { outline: 2px solid #189eff !important; outline-offset: 3px; }
    </style>
</head>
<body>${body}</body>
</html>`;
        },

        emptyPreviewHtml() {
            return `<div class="realtime-mail-template-editor__empty-preview">${this.$tc('realtime-mail-template-editor.preview.empty')}</div>`;
        },

        previewPlainText() {
            return this.preview.contentPlain || '';
        },

        deviceWidths() {
            return {
                desktop: '100%',
                tablet: '600px',
                mobile: '375px',
            };
        },

        previewFrameWidth() {
            return this.deviceWidths[this.previewDevice] || '100%';
        },
    },

    watch: {
        selectedTemplateId() {
            this.loadSelectedTemplate();
        },

        selectedTemplate: {
            deep: true,
            handler() {
                this.queueRender();
            },
        },

        'previewEdit.replacementText'(value) {
            // Mirror panel edits into the inline-edited preview element. Typing inside
            // the iframe produces an identical value, so this only fires a DOM write
            // when the panel textarea was the source of the change.
            const target = this.previewEditTarget;

            if (!target || this.getElementText(target) === value.trim()) {
                return;
            }

            target.innerText = value;
        },
    },

    created() {
        // DOM references from the preview iframe; intentionally non-reactive.
        this.previewEditTarget = null;
        this.previewEditTextNode = null;
        this.previewEditOriginalHtml = '';

        this.loadTemplates();
    },

    beforeDestroy() {
        window.clearTimeout(this.renderDebounce);
    },

    methods: {
        async loadTemplates() {
            this.isLoading = true;

            const criteria = new Criteria(1, 100);
            criteria.addAssociation('mailTemplateType');
            criteria.addSorting(Criteria.sort('mailTemplateType.name', 'ASC'));
            criteria.addSorting(Criteria.sort('description', 'ASC'));

            try {
                this.templates = await this.mailTemplateRepository.search(criteria);
                this.selectedTemplateId = this.templates.first()?.id || null;
            } catch (error) {
                this.createNotificationError({
                    message: error.message,
                });
            } finally {
                this.isLoading = false;
            }
        },

        async loadSelectedTemplate() {
            if (!this.selectedTemplateId) {
                this.selectedTemplate = null;
                return;
            }

            this.isLoading = true;

            const criteria = new Criteria();
            criteria.addAssociation('mailTemplateType');

            try {
                this.selectedTemplate = await this.mailTemplateRepository.get(
                    this.selectedTemplateId,
                    Shopware.Context.api,
                    criteria,
                );
                await this.loadMailTemplateType();
                await this.loadCustomFields();
                this.activeVariableGroup = 'all';
                this.clearPreviewEdit();
            } catch (error) {
                this.createNotificationError({
                    message: error.message,
                });
            } finally {
                this.isLoading = false;
            }
        },

        async loadMailTemplateType() {
            if (!this.selectedTemplate?.mailTemplateTypeId) {
                return;
            }

            this.selectedTemplate.mailTemplateType = await this.mailTemplateTypeRepository.get(
                this.selectedTemplate.mailTemplateTypeId,
                Shopware.Context.api,
            );
        },

        getMailTemplateLabel(mailTemplate) {
            if (!mailTemplate) {
                return '';
            }

            const translatedTypeName = mailTemplate.mailTemplateType?.translated?.name
                || mailTemplate.mailTemplateType?.name
                || this.$tc('realtime-mail-template-editor.editor.unknownType');

            return `${translatedTypeName} - ${mailTemplate.description || mailTemplate.subject || mailTemplate.id}`;
        },

        queueRender() {
            window.clearTimeout(this.renderDebounce);
            this.renderDebounce = window.setTimeout(() => {
                this.renderPreview();
            }, 300);
        },

        insertVariable(variable) {
            if (!this.selectedTemplate || !this.canEdit) {
                return;
            }

            const token = `{{ ${variable.value} }}`;
            const currentContent = this.selectedTemplate.contentHtml || '';
            const separator = currentContent.endsWith(' ') || currentContent.endsWith('\n') || currentContent === ''
                ? ''
                : ' ';

            this.selectedTemplate.contentHtml = `${currentContent}${separator}${token}`;
        },

        addVariable(variables, path, source) {
            if (!path || variables.has(path)) {
                return;
            }

            variables.set(path, {
                label: this.formatVariableLabel(path),
                value: path,
                example: source === 'customField' ? this.$tc('realtime-mail-template-editor.variables.customField') : '',
                group: source === 'customField' ? 'customFields' : (path.split('.')[0] || 'advanced'),
                source,
            });
        },

        flattenTemplateData(data, prefix = '', paths = []) {
            Object.entries(data || {}).forEach(([key, value]) => {
                const normalizedKey = Number.isInteger(Number(key)) ? `at(${key})` : key;
                const path = prefix ? `${prefix}.${normalizedKey}` : normalizedKey;

                paths.push(path);

                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    this.flattenTemplateData(value, path, paths);
                }

                if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
                    this.flattenTemplateData(value[0], `${prefix ? `${prefix}.` : ''}${key}.first`, paths);
                }
            });

            return paths;
        },

        getEntityMappingVariables() {
            const availableEntities = this.selectedTemplate?.mailTemplateType?.availableEntities || {};
            const paths = new Set(Object.keys(availableEntities));
            const queue = Object.keys(availableEntities);
            const visited = new Set(queue);
            const maxVariables = 800;

            while (queue.length > 0 && paths.size < maxVariables) {
                const prefix = queue.shift();
                const mapping = this.entityMappingService.getEntityMapping(prefix, availableEntities);

                Object.keys(mapping).forEach((property) => {
                    const cleanProperty = property.replace('[0]', 'first');
                    const path = `${prefix}.${cleanProperty}`;

                    if (paths.size >= maxVariables || visited.has(path)) {
                        return;
                    }

                    paths.add(path);
                    visited.add(path);

                    const schema = mapping[property] || {};
                    const canExpand = ['object', 'json_object', 'array', 'association'].includes(schema.type)
                        || Boolean(schema.entity);

                    if (canExpand && path.split('.').length < 5) {
                        queue.push(path.replace('.first', '[0]'));
                    }
                });
            }

            return Array.from(paths);
        },

        getCustomFieldVariables() {
            const availableEntities = this.selectedTemplate?.mailTemplateType?.availableEntities || {};
            const variables = [];

            Object.entries(availableEntities).forEach(([rootName, entityName]) => {
                if (!entityName) {
                    return;
                }

                this.customFields.forEach((customField) => {
                    const relations = customField.customFieldSet?.relations || [];
                    const hasMatchingRelation = relations.some((relation) => relation.entityName === entityName);

                    if (hasMatchingRelation) {
                        variables.push(`${rootName}.customFields.${customField.name}`);
                    }
                });
            });

            return variables;
        },

        formatVariableLabel(path) {
            const segments = path.split('.');
            const lastSegment = segments[segments.length - 1] || path;

            if (segments.includes('customFields')) {
                return `${this.formatVariableGroupLabel(segments[0])}: ${lastSegment}`;
            }

            return lastSegment
                .replace(/([A-Z])/g, ' $1')
                .replace(/[_-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/^./, (character) => character.toUpperCase());
        },

        formatVariableGroupLabel(group) {
            const labelMap = {
                salesChannel: this.$tc('realtime-mail-template-editor.variables.groupSalesChannel'),
                order: this.$tc('realtime-mail-template-editor.variables.groupOrder'),
                customer: this.$tc('realtime-mail-template-editor.variables.groupCustomer'),
                product: this.$tc('realtime-mail-template-editor.variables.groupProduct'),
                newsletterRecipient: this.$tc('realtime-mail-template-editor.variables.groupNewsletter'),
                customFields: this.$tc('realtime-mail-template-editor.variables.groupCustomFields'),
            };

            return labelMap[group] || group
                .replace(/([A-Z])/g, ' $1')
                .replace(/[_-]/g, ' ')
                .replace(/^./, (character) => character.toUpperCase());
        },

        async loadCustomFields() {
            if (this.customFields.length > 0) {
                return;
            }

            const criteria = new Criteria(1, 500);
            criteria.addAssociation('customFieldSet.relations');
            criteria.addSorting(Criteria.sort('name', 'ASC'));

            try {
                this.customFields = await this.customFieldRepository.search(criteria);
            } catch (error) {
                this.customFields = [];
            }
        },

        bindPreviewInteractions(event) {
            const iframe = event.target;
            const iframeDocument = iframe.contentDocument || iframe.contentWindow?.document;

            if (!iframeDocument?.body) {
                return;
            }

            // The iframe reloaded, so any element from the previous document is gone.
            this.previewEditTarget = null;
            this.previewEditTextNode = null;
            this.previewEditOriginalHtml = '';
            this.clearPreviewEdit();

            iframeDocument.body.addEventListener('click', (clickEvent) => {
                clickEvent.preventDefault();
                this.startPreviewEdit(clickEvent, iframeDocument);
            });

            iframeDocument.body.addEventListener('input', () => {
                if (this.previewEditTarget) {
                    this.previewEdit.replacementText = this.getElementText(this.previewEditTarget);
                }
            });
        },

        startPreviewEdit(clickEvent, iframeDocument) {
            if (!this.canEdit || !this.selectedTemplate) {
                return;
            }

            const textNode = this.getTextNodeAtPoint(clickEvent, iframeDocument);
            const element = textNode?.parentElement || clickEvent.target;

            if (!element || element === iframeDocument.body) {
                return;
            }

            // Clicks inside the element being edited just move the caret.
            if (this.previewEditTarget
                && (this.previewEditTarget === element || this.previewEditTarget.contains(element))) {
                return;
            }

            this.stopInlineEdit(true);

            const text = this.getElementText(element);

            if (!text) {
                this.clearPreviewEdit();
                return;
            }

            const sourceMatch = this.findSourceMatch(element, textNode);

            this.previewEditTarget = element;
            this.previewEditTextNode = textNode || null;
            this.previewEditOriginalHtml = element.innerHTML;
            element.setAttribute('contenteditable', 'true');
            element.focus();

            this.previewEdit = {
                originalText: text,
                replacementText: text,
                matchedSource: sourceMatch ? sourceMatch.text : '',
                matchStart: sourceMatch ? sourceMatch.start : -1,
                matchLength: sourceMatch ? sourceMatch.length : 0,
                matchType: sourceMatch ? sourceMatch.type : '',
            };
        },

        getTextNodeAtPoint(clickEvent, iframeDocument) {
            if (typeof iframeDocument.caretRangeFromPoint === 'function') {
                const range = iframeDocument.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);

                if (range?.startContainer?.nodeType === 3) {
                    return range.startContainer;
                }
            }

            if (typeof iframeDocument.caretPositionFromPoint === 'function') {
                const position = iframeDocument.caretPositionFromPoint(clickEvent.clientX, clickEvent.clientY);

                if (position?.offsetNode?.nodeType === 3) {
                    return position.offsetNode;
                }
            }

            return null;
        },

        getElementText(element) {
            return (element.innerText || element.textContent || '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 500);
        },

        findSourceMatch(element, textNode) {
            const content = this.selectedTemplate?.contentHtml || '';

            if (!content) {
                return null;
            }

            // Tier 1: the exact text node or markup appears verbatim in the template.
            // The type decides what the replacement is built from on apply: plain text
            // for a text-node match, innerHTML for anything that may contain markup.
            const exactCandidates = [];
            const rawNodeText = textNode?.data || '';

            if (rawNodeText.trim()) {
                exactCandidates.push({ text: rawNodeText, type: 'node' });
                exactCandidates.push({ text: rawNodeText.trim(), type: 'node' });
            }

            const innerHtml = (element.innerHTML || '').trim();

            if (innerHtml) {
                exactCandidates.push({ text: innerHtml, type: 'html' });
            }

            for (const candidate of exactCandidates) {
                const index = content.indexOf(candidate.text);

                if (index >= 0) {
                    return {
                        start: index,
                        length: candidate.text.length,
                        text: candidate.text,
                        type: candidate.type,
                    };
                }
            }

            // Tier 2: tolerant match — allow whitespace, entities, inline tags and Twig
            // expressions between the static words of the rendered text.
            const visibleText = this.getElementText(element);
            const pattern = this.createTolerantPattern(visibleText);

            if (!pattern) {
                return null;
            }

            const match = content.match(new RegExp(pattern));

            if (match && match.index !== undefined) {
                return {
                    start: match.index,
                    length: match[0].length,
                    text: match[0],
                    type: 'html',
                };
            }

            return null;
        },

        createTolerantPattern(visibleText) {
            if (!visibleText) {
                return null;
            }

            // Mask rendered variable output (the controller's sample data) so only the
            // static text has to match the template source.
            let masked = visibleText;

            this.previewSampleValues.forEach((value) => {
                masked = masked.split(value).join('\u0000');
            });

            const staticParts = masked
                .split('\u0000')
                .map((part) => part.trim())
                .filter((part) => part.length > 0);

            // Without a reasonable static anchor the pattern would match almost anything.
            if (staticParts.join('').replace(/\s/g, '').length < 3) {
                return null;
            }

            const wordGap = '(?:\\s|&nbsp;|<[^>]*>)+';
            const variableGap = '(?:\\{\\{[\\s\\S]*?\\}\\}|\\{%[\\s\\S]*?%\\}|\\s|&nbsp;|<[^>]*>)+';

            return staticParts
                .map((part) => part
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((word) => this.escapeRegExp(word))
                    .join(wordGap))
                .join(variableGap);
        },

        applyPreviewTextEdit() {
            if (!this.selectedTemplate || !this.canEdit || !this.hasSourceMatch) {
                return;
            }

            const content = this.selectedTemplate.contentHtml || '';
            const { matchedSource, matchLength } = this.previewEdit;
            let { matchStart } = this.previewEdit;

            // The template may have changed in the code editor since the click;
            // re-validate the stored range and fall back to searching again.
            if (content.substr(matchStart, matchLength) !== matchedSource) {
                matchStart = content.indexOf(matchedSource);
            }

            if (matchStart < 0) {
                this.createNotificationError({
                    message: this.$tc('realtime-mail-template-editor.preview.editNotFound'),
                });
                return;
            }

            // Build the replacement from what was matched: a text-node match is replaced
            // with the node's edited text, everything else with the element's edited
            // innerHTML so markup like <br> and inline tags survives the edit.
            let replacementText = this.previewEdit.replacementText.trim();

            if (this.previewEdit.matchType === 'node' && this.previewEditTextNode?.parentNode) {
                replacementText = this.previewEditTextNode.data;
            } else if (this.previewEdit.matchType === 'html' && this.previewEditTarget) {
                replacementText = this.previewEditTarget.innerHTML;
            }

            this.selectedTemplate.contentHtml = content.slice(0, matchStart)
                + replacementText
                + content.slice(matchStart + matchLength);

            this.stopInlineEdit(false);
            this.clearPreviewEdit();
        },

        cancelPreviewEdit() {
            this.stopInlineEdit(true);
            this.clearPreviewEdit();
        },

        stopInlineEdit(restoreOriginal) {
            const target = this.previewEditTarget;

            if (target) {
                target.removeAttribute('contenteditable');

                if (restoreOriginal && this.previewEditOriginalHtml) {
                    target.innerHTML = this.previewEditOriginalHtml;
                }
            }

            this.previewEditTarget = null;
            this.previewEditTextNode = null;
            this.previewEditOriginalHtml = '';
        },

        escapeRegExp(text) {
            return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        clearPreviewEdit() {
            this.previewEdit = {
                originalText: '',
                replacementText: '',
                matchedSource: '',
                matchStart: -1,
                matchLength: 0,
                matchType: '',
            };
        },

        async renderPreview() {
            if (!this.selectedTemplate) {
                return;
            }

            this.isRendering = true;
            this.renderError = null;

            try {
                const response = await this.httpClient.post(
                    '/_action/realtime-mail-template-editor/render',
                    {
                        subject: this.selectedTemplate.subject || '',
                        senderName: this.selectedTemplate.senderName || '',
                        contentHtml: this.selectedTemplate.contentHtml || '',
                        contentPlain: this.selectedTemplate.contentPlain || '',
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${Shopware.Service('loginService').getToken()}`,
                        },
                    },
                );

                this.preview = response.data.data;
            } catch (error) {
                this.renderError = error.response?.data?.errors?.[0]?.detail || error.message;
            } finally {
                this.isRendering = false;
            }
        },

        async onSave() {
            if (!this.canEdit) {
                this.createNotificationError({
                    message: this.$tc('global.notification.noPermission'),
                });
                return;
            }

            this.isLoading = true;
            this.isSaveSuccessful = false;

            try {
                await this.mailTemplateRepository.save(this.selectedTemplate);
                this.isSaveSuccessful = true;
                this.createNotificationSuccess({
                    message: this.$tc('realtime-mail-template-editor.notification.saveSuccess'),
                });
            } catch (error) {
                this.createNotificationError({
                    message: error.message,
                });
            } finally {
                this.isLoading = false;
            }
        },

    },
});
