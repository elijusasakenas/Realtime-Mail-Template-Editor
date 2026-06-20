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
            previewEdit: {
                originalText: '',
                replacementText: '',
                sourceText: '',
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
            const groups = new Map();

            this.availableVariables.forEach((variable) => {
                groups.set(variable.group, this.formatVariableGroupLabel(variable.group));
            });

            return [
                {
                    value: 'all',
                    label: this.$tc('realtime-mail-template-editor.variables.groupAll'),
                },
                ...Array.from(groups.entries())
                    .sort(([first], [second]) => first.localeCompare(second))
                    .map(([value, label]) => ({ value, label })),
            ];
        },

        filteredVariables() {
            const term = this.variableSearchTerm.trim().toLowerCase();

            return this.availableVariables.filter((variable) => {
                const matchesGroup = this.activeVariableGroup === 'all' || variable.group === this.activeVariableGroup;
                const matchesTerm = !term
                    || `${variable.label} ${variable.value} ${variable.example}`.toLowerCase().includes(term);

                return matchesGroup && matchesTerm;
            });
        },

        hasPreviewEditSelection() {
            return this.previewEdit.originalText.trim().length > 0;
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
    </style>
</head>
<body>${body}</body>
</html>`;
        },

        emptyPreviewHtml() {
            return `<div class="realtime-mail-template-editor__empty-preview">${this.$tc('realtime-mail-template-editor.preview.empty')}</div>`;
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
    },

    created() {
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
                group: path.split('.')[0] || 'advanced',
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
            const maxVariables = 240;

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

            if (!iframeDocument) {
                return;
            }

            iframeDocument.body.addEventListener('click', (clickEvent) => {
                clickEvent.preventDefault();

                const text = this.getPreviewNodeText(clickEvent.target, iframeDocument);

                if (!text) {
                    return;
                }

                this.previewEdit = {
                    originalText: text,
                    replacementText: text,
                    sourceText: this.findEditableSourceText(text),
                };
            });
        },

        getPreviewNodeText(node, iframeDocument) {
            if (!node) {
                return '';
            }

            const selection = iframeDocument.getSelection?.();
            const selectedText = selection?.toString?.().trim();
            const text = selectedText || node.innerText || node.textContent || '';

            return text
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 240);
        },

        applyPreviewTextEdit() {
            if (!this.selectedTemplate || !this.hasPreviewEditSelection) {
                return;
            }

            const originalText = this.previewEdit.originalText.trim();
            const replacementText = this.previewEdit.replacementText.trim();
            const currentContent = this.selectedTemplate.contentHtml || '';
            const sourceText = this.previewEdit.sourceText || originalText;

            const nextContent = this.replaceRenderedText(currentContent, sourceText, replacementText);

            if (nextContent === currentContent) {
                this.createNotificationError({
                    message: this.$tc('realtime-mail-template-editor.preview.editNotFound'),
                });
                return;
            }

            this.selectedTemplate.contentHtml = nextContent;
            this.clearPreviewEdit();
        },

        findEditableSourceText(renderedText) {
            const content = this.selectedTemplate?.contentHtml || '';

            if (content.includes(renderedText)) {
                return renderedText;
            }

            const renderedWords = this.normalizeText(renderedText).split(' ').filter((word) => word.length > 2);
            const sourceTextCandidates = content
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/(p|div|td|tr|li|h[1-6])>/gi, '\n')
                .replace(/<[^>]+>/g, ' ')
                .split(/\n+/)
                .map((line) => line.replace(/\s+/g, ' ').trim())
                .filter((line) => line.length > 0);

            return sourceTextCandidates.find((candidate) => {
                const normalizedCandidate = this.normalizeText(candidate.replace(/{{.*?}}/g, ' '));

                return renderedWords.some((word) => normalizedCandidate.includes(word));
            }) || renderedText;
        },

        replaceRenderedText(content, sourceText, replacementText) {
            if (content.includes(sourceText)) {
                return content.replace(sourceText, replacementText);
            }

            const sourcePattern = this.createTwigAwarePattern(sourceText);
            const regex = new RegExp(sourcePattern);

            if (regex.test(content)) {
                return content.replace(regex, replacementText);
            }

            return content;
        },

        createTwigAwarePattern(sourceText) {
            return sourceText
                .split(/({{[\s\S]*?}}|{%[\s\S]*?%})/g)
                .map((part) => {
                    if (part.startsWith('{{') || part.startsWith('{%')) {
                        return '[\\s\\S]*?';
                    }

                    return this.escapeRegExp(part).replace(/\s+/g, '\\s+');
                })
                .join('');
        },

        normalizeText(text) {
            return text
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .trim();
        },

        escapeRegExp(text) {
            return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        clearPreviewEdit() {
            this.previewEdit = {
                originalText: '',
                replacementText: '',
                sourceText: '',
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

        onChangeLanguage(languageId) {
            Shopware.State.commit('context/setApiLanguageId', languageId);
            this.loadSelectedTemplate();
        },
    },
});
