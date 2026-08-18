// ==UserScript==
// @name         Reuters English Reader
// @name:zh-CN   Reuters 英文精读助手
// @name:en      Reuters English Reader
// @namespace    https://scripts.fulafu.com/
// @version      0.1.1
// @description  Sentence-by-sentence Reuters reading with word definitions, selected-text translation, and grammar structure highlighting through a user-configured OpenAI-compatible API.
// @description:zh-CN 为 Reuters 英文新闻提供逐句区分、单词释义、选句翻译和句子主干标亮，API 信息由使用者本地配置。
// @description:en Sentence-by-sentence Reuters reading with word definitions, selected-text translation, and grammar structure highlighting through a user-configured OpenAI-compatible API.
// @author       ZhangNingYA
// @homepageURL  https://scripts.fulafu.com/scripts/reuters-english-reader/
// @supportURL   https://github.com/ZhangNingYA/userscripts/issues
// @updateURL    https://scripts.fulafu.com/scripts/reuters-english-reader/reuters-english-reader.user.js
// @downloadURL  https://scripts.fulafu.com/scripts/reuters-english-reader/reuters-english-reader.user.js
// @match        https://www.reuters.com/*
// @match        https://reuters.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_VERSION = '0.1.1';
    const SCRIPT_RELEASED_AT = '2026-08-18 12:09:38 UTC+8';
    const CONFIG_KEY = 'reuters-english-reader-config-v1';
    const SENTENCE_PREFIX = 'rer-s';
    const MAX_ANALYSIS_SENTENCES = 80;
    const ANALYSIS_BATCH_SIZE = 8;
    const DEFAULT_MODEL = 'gpt-5.6-luna';
    const DEFAULT_CONFIG = {
        endpoint: '',
        apiKey: '',
        model: DEFAULT_MODEL,
        autoAnalyze: false,
        targetLanguage: 'Simplified Chinese'
    };
    const ROLE_CLASS = {
        subject: 'rer-role-subject',
        predicate: 'rer-role-predicate',
        object: 'rer-role-object',
        complement: 'rer-role-complement',
        modifier: 'rer-role-modifier',
        connector: 'rer-role-connector'
    };
    const ROLE_LABEL = {
        subject: '主语',
        predicate: '谓语',
        object: '宾语',
        complement: '补语',
        modifier: '修饰',
        connector: '连接'
    };

    let config = loadConfig();
    let sentenceCounter = 0;
    let articleRoot = null;
    let toolbarRoot = null;
    let settingsRoot = null;
    let popoverRoot = null;
    let statusNode = null;
    let pendingSelectionTimer = 0;
    let analyzeRunning = false;
    const sentences = new Map();

    const css = String.raw`
        :root {
            --rer-bg: #fffdf8;
            --rer-ink: #1f2933;
            --rer-muted: #5d6875;
            --rer-line: rgba(58, 69, 82, 0.18);
            --rer-accent: #0b6b64;
            --rer-accent-strong: #064e49;
            --rer-warm: #a5481c;
            --rer-panel: #ffffff;
            --rer-shadow: 0 14px 36px rgba(22, 31, 45, 0.18);
        }

        html.rer-reading-active article p[data-rer-paragraph="true"],
        html.rer-reading-active main p[data-rer-paragraph="true"] {
            line-height: 1.78 !important;
        }

        .rer-sentence {
            display: block;
            box-sizing: border-box;
            margin: 0.48em 0;
            padding: 0.42em 0.58em 0.46em;
            border-left: 3px solid rgba(11, 107, 100, 0.55);
            border-bottom: 1px solid var(--rer-line);
            border-radius: 6px;
            background: rgba(255, 253, 248, 0.82);
            color: inherit;
            letter-spacing: 0 !important;
            transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
        }

        .rer-sentence:nth-of-type(2n) {
            border-left-color: rgba(165, 72, 28, 0.48);
            background: rgba(246, 249, 249, 0.82);
        }

        .rer-sentence:hover {
            background: rgba(236, 248, 246, 0.9);
            box-shadow: inset 0 0 0 1px rgba(11, 107, 100, 0.22);
        }

        .rer-sentence.rer-analyzed {
            border-left-color: rgba(11, 107, 100, 0.88);
        }

        .rer-structure {
            border-radius: 4px;
            padding: 0.02em 0.06em 0.04em;
            text-decoration-line: underline;
            text-decoration-thickness: 2px;
            text-underline-offset: 0.18em;
            box-decoration-break: clone;
            -webkit-box-decoration-break: clone;
        }

        .rer-role-subject {
            background: rgba(22, 119, 255, 0.12);
            text-decoration-color: #1677ff;
        }

        .rer-role-predicate {
            background: rgba(214, 68, 88, 0.13);
            text-decoration-color: #d64458;
        }

        .rer-role-object {
            background: rgba(21, 128, 61, 0.13);
            text-decoration-color: #15803d;
        }

        .rer-role-complement {
            background: rgba(126, 87, 194, 0.14);
            text-decoration-color: #7e57c2;
        }

        .rer-role-modifier {
            background: rgba(199, 125, 0, 0.14);
            text-decoration-color: #c77d00;
        }

        .rer-role-connector {
            background: rgba(12, 124, 156, 0.14);
            text-decoration-color: #0c7c9c;
        }

        .rer-toolbar,
        .rer-popover,
        .rer-settings {
            box-sizing: border-box;
            color: var(--rer-ink);
            font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
            letter-spacing: 0;
            z-index: 2147483646;
        }

        .rer-toolbar {
            position: fixed;
            top: 72px;
            right: 18px;
            width: min(326px, calc(100vw - 24px));
            padding: 9px;
            border: 1px solid rgba(31, 41, 51, 0.16);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.95);
            box-shadow: var(--rer-shadow);
            backdrop-filter: blur(12px);
        }

        .rer-toolbar-row {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }

        .rer-toolbar-title {
            min-width: 0;
            flex: 1;
            font-size: 13px;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .rer-version {
            color: var(--rer-muted);
            font-size: 11px;
            font-weight: 500;
        }

        .rer-status {
            margin-top: 7px;
            color: var(--rer-muted);
            font-size: 11px;
            line-height: 1.35;
        }

        .rer-button {
            appearance: none;
            border: 1px solid rgba(11, 107, 100, 0.28);
            border-radius: 6px;
            background: #f7fbfa;
            color: var(--rer-accent-strong);
            cursor: pointer;
            font: inherit;
            font-size: 12px;
            font-weight: 650;
            line-height: 1;
            min-height: 32px;
            padding: 0 10px;
            touch-action: manipulation;
        }

        .rer-button:hover {
            background: #ecf8f6;
            border-color: rgba(11, 107, 100, 0.48);
        }

        .rer-button:disabled {
            cursor: not-allowed;
            opacity: 0.58;
        }

        .rer-button-primary {
            background: var(--rer-accent);
            border-color: var(--rer-accent);
            color: #ffffff;
        }

        .rer-button-primary:hover {
            background: var(--rer-accent-strong);
        }

        .rer-popover {
            position: fixed;
            max-width: min(420px, calc(100vw - 24px));
            max-height: min(440px, calc(100vh - 24px));
            overflow: auto;
            padding: 12px;
            border: 1px solid rgba(31, 41, 51, 0.16);
            border-radius: 8px;
            background: var(--rer-panel);
            box-shadow: var(--rer-shadow);
        }

        .rer-popover-header {
            display: flex;
            align-items: start;
            gap: 12px;
            margin-bottom: 8px;
        }

        .rer-popover-title {
            flex: 1;
            min-width: 0;
            font-size: 15px;
            font-weight: 760;
            line-height: 1.25;
            overflow-wrap: anywhere;
        }

        .rer-popover-close {
            appearance: none;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: var(--rer-muted);
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            min-height: 28px;
            min-width: 28px;
        }

        .rer-popover-close:hover {
            background: rgba(31, 41, 51, 0.08);
            color: var(--rer-ink);
        }

        .rer-popover-body {
            color: var(--rer-ink);
            font-size: 13px;
            line-height: 1.55;
        }

        .rer-popover-body p {
            margin: 0 0 0.58em;
        }

        .rer-popover-body p:last-child {
            margin-bottom: 0;
        }

        .rer-popover-list {
            margin: 0.3em 0 0;
            padding-left: 1.2em;
        }

        .rer-popover-list li {
            margin: 0.16em 0;
        }

        .rer-label {
            display: inline-flex;
            align-items: center;
            margin-right: 0.38em;
            color: var(--rer-muted);
            font-size: 12px;
            font-weight: 650;
        }

        .rer-settings-backdrop {
            position: fixed;
            inset: 0;
            z-index: 2147483645;
            background: rgba(8, 12, 18, 0.26);
        }

        .rer-settings {
            position: fixed;
            top: 72px;
            right: 16px;
            width: min(430px, calc(100vw - 32px));
            max-height: calc(100vh - 92px);
            overflow: auto;
            padding: 16px;
            border: 1px solid rgba(31, 41, 51, 0.18);
            border-radius: 8px;
            background: var(--rer-panel);
            box-shadow: var(--rer-shadow);
        }

        .rer-settings h2 {
            margin: 0 0 12px;
            font-size: 18px;
            line-height: 1.25;
        }

        .rer-field {
            display: grid;
            gap: 5px;
            margin: 12px 0;
        }

        .rer-field label {
            color: var(--rer-ink);
            font-size: 12px;
            font-weight: 700;
        }

        .rer-field input[type="text"],
        .rer-field input[type="password"] {
            box-sizing: border-box;
            width: 100%;
            min-height: 36px;
            border: 1px solid rgba(31, 41, 51, 0.18);
            border-radius: 6px;
            padding: 7px 9px;
            color: var(--rer-ink);
            font: inherit;
            font-size: 13px;
        }

        .rer-field input:focus {
            border-color: rgba(11, 107, 100, 0.62);
            outline: 2px solid rgba(11, 107, 100, 0.16);
        }

        .rer-help {
            color: var(--rer-muted);
            font-size: 12px;
            line-height: 1.45;
        }

        .rer-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 12px 0;
            color: var(--rer-ink);
            font-size: 13px;
        }

        .rer-settings-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 14px;
        }

        .rer-legend {
            display: flex;
            flex-wrap: wrap;
            gap: 7px 9px;
            margin-top: 7px;
        }

        .rer-legend span {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            min-height: 16px;
            color: var(--rer-muted);
            font-size: 11px;
            white-space: nowrap;
        }

        .rer-legend span::before {
            content: "";
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: rgba(31, 41, 51, 0.38);
        }

        .rer-legend span:nth-child(1)::before { background: #1677ff; }
        .rer-legend span:nth-child(2)::before { background: #d64458; }
        .rer-legend span:nth-child(3)::before { background: #15803d; }
        .rer-legend span:nth-child(4)::before { background: #7e57c2; }
        .rer-legend span:nth-child(5)::before { background: #c77d00; }
        .rer-legend span:nth-child(6)::before { background: #0c7c9c; }

        @media (max-width: 560px) {
            .rer-toolbar {
                right: 12px;
                top: 62px;
                width: calc(100vw - 24px);
            }

            .rer-toolbar-row {
                flex-wrap: wrap;
            }

            .rer-toolbar-title {
                flex-basis: 100%;
            }

            .rer-button {
                flex: 1;
            }

            .rer-settings {
                right: 10px;
                top: 62px;
                width: calc(100vw - 20px);
                max-height: calc(100vh - 72px);
            }
        }
    `;

    function init() {
        GM_addStyle(css);
        document.documentElement.classList.add('rer-reading-active');
        buildToolbar();
        enhanceArticle();
        observePageChanges();
        installInteractionHandlers();
        registerMenu();
        setStatus(getConfigReady() ? '已按句子整理正文。点击单词查释义，选中句子翻译。' : '请先打开设置，填写 API 地址和 key。');
    }

    function loadConfig() {
        const stored = safeGetValue(CONFIG_KEY, {});
        return { ...DEFAULT_CONFIG, ...(stored && typeof stored === 'object' ? stored : {}) };
    }

    function saveConfig(nextConfig) {
        config = { ...DEFAULT_CONFIG, ...nextConfig };
        safeSetValue(CONFIG_KEY, config);
    }

    function safeGetValue(key, fallback) {
        try {
            return GM_getValue(key, fallback);
        } catch (error) {
            console.warn('[Reuters English Reader] Failed to read config', error);
            return fallback;
        }
    }

    function safeSetValue(key, value) {
        try {
            GM_setValue(key, value);
        } catch (error) {
            console.warn('[Reuters English Reader] Failed to save config', error);
        }
    }

    function getConfigReady() {
        return Boolean(config.endpoint && config.apiKey && config.model);
    }

    function buildToolbar() {
        if (toolbarRoot) return;
        toolbarRoot = document.createElement('section');
        toolbarRoot.className = 'rer-toolbar';
        toolbarRoot.setAttribute('aria-label', 'Reuters English Reader');
        toolbarRoot.innerHTML = `
            <div class="rer-toolbar-row">
                <div class="rer-toolbar-title">Reuters 精读 <span class="rer-version">v${escapeHtml(SCRIPT_VERSION)}</span></div>
                <button type="button" class="rer-button rer-button-primary" data-rer-action="analyze">结构</button>
                <button type="button" class="rer-button" data-rer-action="settings">设置</button>
            </div>
            <div class="rer-status" data-rer-status>初始化中</div>
            <div class="rer-legend" aria-label="Structure legend">
                <span>蓝: 主语</span><span>红: 谓语</span><span>绿: 宾语</span><span>紫: 补语</span><span>橙: 修饰</span><span>青: 连接</span>
            </div>
        `;
        statusNode = toolbarRoot.querySelector('[data-rer-status]');
        toolbarRoot.addEventListener('click', (event) => {
            const button = event.target.closest('[data-rer-action]');
            if (!button) return;
            const action = button.getAttribute('data-rer-action');
            if (action === 'settings') {
                showSettings();
            } else if (action === 'analyze') {
                analyzeSentences();
            }
        });
        document.documentElement.append(toolbarRoot);
    }

    function setStatus(message) {
        if (statusNode) statusNode.textContent = message;
    }

    function registerMenu() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        GM_registerMenuCommand('Reuters Reader: 设置 API', showSettings);
        GM_registerMenuCommand('Reuters Reader: 分析句子结构', analyzeSentences);
    }

    function showSettings() {
        if (settingsRoot) {
            settingsRoot.remove();
            settingsRoot = null;
        }
        const backdrop = document.createElement('div');
        backdrop.className = 'rer-settings-backdrop';
        const panel = document.createElement('section');
        panel.className = 'rer-settings';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', 'Reuters English Reader settings');
        panel.innerHTML = `
            <h2>Reuters 精读设置</h2>
            <div class="rer-help">API key 只保存在本地 userscript 存储中，调用时只发送到你填写的 API 地址。</div>
            <div class="rer-field">
                <label for="rer-endpoint">API 地址</label>
                <input id="rer-endpoint" type="text" autocomplete="off" spellcheck="false" placeholder="https://example.com/v1/chat/completions">
                <div class="rer-help">支持 OpenAI-compatible 接口；可填写 base URL、/v1 或 /v1/chat/completions。</div>
            </div>
            <div class="rer-field">
                <label for="rer-key">API key</label>
                <input id="rer-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-...">
            </div>
            <div class="rer-field">
                <label for="rer-model">模型</label>
                <input id="rer-model" type="text" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(DEFAULT_MODEL)}">
            </div>
            <label class="rer-checkbox">
                <input id="rer-auto" type="checkbox">
                打开文章后自动分析句子结构
            </label>
            <div class="rer-help">版本 ${escapeHtml(SCRIPT_VERSION)} · ${escapeHtml(SCRIPT_RELEASED_AT)}</div>
            <div class="rer-settings-actions">
                <button type="button" class="rer-button" data-rer-settings="cancel">取消</button>
                <button type="button" class="rer-button rer-button-primary" data-rer-settings="save">保存</button>
            </div>
        `;
        settingsRoot = document.createElement('div');
        settingsRoot.append(backdrop, panel);
        document.documentElement.append(settingsRoot);

        const endpointInput = panel.querySelector('#rer-endpoint');
        const keyInput = panel.querySelector('#rer-key');
        const modelInput = panel.querySelector('#rer-model');
        const autoInput = panel.querySelector('#rer-auto');
        endpointInput.value = config.endpoint || '';
        keyInput.value = config.apiKey || '';
        modelInput.value = config.model || DEFAULT_MODEL;
        autoInput.checked = Boolean(config.autoAnalyze);

        const close = () => {
            if (settingsRoot) settingsRoot.remove();
            settingsRoot = null;
        };
        backdrop.addEventListener('click', close);
        panel.addEventListener('click', (event) => {
            const button = event.target.closest('[data-rer-settings]');
            if (!button) return;
            const action = button.getAttribute('data-rer-settings');
            if (action === 'cancel') {
                close();
                return;
            }
            saveConfig({
                endpoint: cleanEndpoint(endpointInput.value),
                apiKey: keyInput.value.trim(),
                model: modelInput.value.trim() || DEFAULT_MODEL,
                autoAnalyze: autoInput.checked,
                targetLanguage: DEFAULT_CONFIG.targetLanguage
            });
            setStatus(getConfigReady() ? '设置已保存。可以点击“结构”分析当前文章。' : '设置已保存，但 API 地址、key、模型需要填写完整。');
            close();
        });
        endpointInput.focus();
    }

    function cleanEndpoint(value) {
        let endpoint = String(value || '').trim();
        while (/^https?:\/\/https?:\/\//i.test(endpoint)) {
            endpoint = endpoint.replace(/^https?:\/\/(https?:\/\/)/i, '$1');
        }
        return endpoint;
    }

    function getChatCompletionsUrl() {
        const endpoint = cleanEndpoint(config.endpoint).replace(/\/+$/, '');
        if (!endpoint) return '';
        if (/\/chat\/completions$/i.test(endpoint)) return endpoint;
        if (/\/v1$/i.test(endpoint)) return `${endpoint}/chat/completions`;
        return `${endpoint}/v1/chat/completions`;
    }

    function enhanceArticle() {
        const root = findArticleRoot();
        if (!root) {
            setStatus('还没有找到 Reuters 正文，页面加载完成后会重试。');
            return;
        }
        articleRoot = root;
        const paragraphs = collectParagraphs(root);
        let changed = 0;
        for (const paragraph of paragraphs) {
            if (paragraph.dataset.rerParagraph === 'true') continue;
            const text = normalizeReadingText(paragraph.textContent);
            if (!shouldProcessParagraph(text, paragraph)) continue;
            const parts = segmentSentences(text);
            if (!parts.length) continue;
            paragraph.textContent = '';
            paragraph.dataset.rerParagraph = 'true';
            for (const sentence of parts) {
                const span = document.createElement('span');
                const id = `${SENTENCE_PREFIX}-${++sentenceCounter}`;
                span.className = 'rer-sentence';
                span.dataset.rerSentenceId = id;
                span.textContent = sentence;
                paragraph.append(span);
                sentences.set(id, { id, text: sentence, node: span, analyzed: false });
            }
            changed += 1;
        }
        if (changed > 0) {
            const count = sentences.size;
            setStatus(`已整理 ${count} 个句子。点击单词查释义，选中句子翻译。`);
            if (config.autoAnalyze && getConfigReady()) {
                window.setTimeout(analyzeSentences, 250);
            }
        }
    }

    function findArticleRoot() {
        const selectors = [
            'article[data-testid*="article" i]',
            'article',
            'main [data-testid*="ArticleBody" i]',
            'main [data-testid*="article-body" i]',
            'main'
        ];
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent && element.textContent.trim().length > 400) {
                return element;
            }
        }
        return null;
    }

    function collectParagraphs(root) {
        const candidates = Array.from(root.querySelectorAll([
            '[data-testid*="paragraph" i]',
            '[data-testid*="body" i] p',
            'p'
        ].join(',')));
        const unique = [];
        const seen = new Set();
        for (const node of candidates) {
            if (!(node instanceof HTMLElement)) continue;
            if (seen.has(node)) continue;
            seen.add(node);
            unique.push(node);
        }
        return unique;
    }

    function shouldProcessParagraph(text, paragraph) {
        if (!text || text.length < 45) return false;
        if (!/[A-Za-z]/.test(text)) return false;
        if (paragraph.closest('.rer-toolbar, .rer-popover, .rer-settings, nav, footer, aside, form, button')) return false;
        if (paragraph.querySelector('time, button, input, textarea, select')) return false;
        const rect = paragraph.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        const lower = text.toLowerCase();
        if (/^(our standards|click here|sign up|reporting by|editing by)\b/.test(lower)) return false;
        return true;
    }

    function normalizeReadingText(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .replace(/\s+([,.;:!?])/g, '$1')
            .trim();
    }

    function segmentSentences(text) {
        const normalized = normalizeReadingText(text);
        if (!normalized) return [];
        if (typeof Intl !== 'undefined' && Intl.Segmenter) {
            const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
            return Array.from(segmenter.segment(normalized), (part) => part.segment.trim()).filter(Boolean);
        }
        return normalized
            .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
            .map((part) => part.trim())
            .filter(Boolean);
    }

    function observePageChanges() {
        let timer = 0;
        const observer = new MutationObserver(() => {
            window.clearTimeout(timer);
            timer = window.setTimeout(enhanceArticle, 500);
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function installInteractionHandlers() {
        document.addEventListener('click', (event) => {
            if (event.target.closest('.rer-toolbar, .rer-popover, .rer-settings')) return;
            const sentenceNode = event.target.closest('.rer-sentence');
            if (!sentenceNode) return;
            const word = getWordFromPoint(event.clientX, event.clientY);
            if (!word) return;
            event.preventDefault();
            event.stopPropagation();
            lookupWord(word, sentenceNode.textContent || '', { x: event.clientX, y: event.clientY });
        }, true);

        document.addEventListener('mouseup', queueSelectionLookup);
        document.addEventListener('keyup', (event) => {
            if (event.key === 'Shift' || event.key.startsWith('Arrow')) queueSelectionLookup();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') hidePopover();
        });
    }

    function queueSelectionLookup() {
        window.clearTimeout(pendingSelectionTimer);
        pendingSelectionTimer = window.setTimeout(handleSelectionLookup, 180);
    }

    function handleSelectionLookup() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
        const text = normalizeReadingText(selection.toString());
        if (text.length < 8 || !/[A-Za-z]/.test(text)) return;
        const range = selection.getRangeAt(0);
        if (!selectionIntersectsReader(range)) return;
        const rect = range.getBoundingClientRect();
        translateSelection(text, {
            x: rect.left + Math.min(rect.width, 220),
            y: rect.bottom + 8
        });
    }

    function selectionIntersectsReader(range) {
        if (!articleRoot) return false;
        const common = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
            ? range.commonAncestorContainer
            : range.commonAncestorContainer.parentElement;
        return Boolean(common && articleRoot.contains(common));
    }

    function getWordFromPoint(x, y) {
        const range = rangeFromPoint(x, y);
        if (!range) return '';
        const node = range.startContainer;
        if (!node || node.nodeType !== Node.TEXT_NODE) {
            const text = node && node.textContent ? node.textContent : '';
            const match = text.match(/[A-Za-z][A-Za-z'’-]*/);
            return match ? normalizeWord(match[0]) : '';
        }
        const text = node.nodeValue || '';
        let index = Math.min(range.startOffset, text.length - 1);
        if (index < 0) return '';
        if (!/[A-Za-z'’-]/.test(text[index]) && index > 0) index -= 1;
        if (!/[A-Za-z'’-]/.test(text[index])) return '';
        let start = index;
        let end = index + 1;
        while (start > 0 && /[A-Za-z'’-]/.test(text[start - 1])) start -= 1;
        while (end < text.length && /[A-Za-z'’-]/.test(text[end])) end += 1;
        return normalizeWord(text.slice(start, end));
    }

    function rangeFromPoint(x, y) {
        if (document.caretRangeFromPoint) {
            return document.caretRangeFromPoint(x, y);
        }
        if (document.caretPositionFromPoint) {
            const position = document.caretPositionFromPoint(x, y);
            if (!position) return null;
            const range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.collapse(true);
            return range;
        }
        return null;
    }

    function normalizeWord(word) {
        return String(word || '').replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').trim();
    }

    async function lookupWord(word, sentenceText, point) {
        if (!ensureReady()) return;
        showPopover(point, `查询: ${word}`, '<p>正在查询释义...</p>');
        try {
            const response = await requestChat({
                system: 'You are a concise English-to-Chinese vocabulary tutor for Reuters news. Return compact JSON only.',
                user: [
                    'Explain this English word for a Chinese reader.',
                    `Word: ${word}`,
                    `Sentence: ${sentenceText}`,
                    'Return JSON with keys: word, partOfSpeech, meaning, inSentence, note.',
                    'Use Simplified Chinese for explanations. Keep meaning under 40 Chinese characters.'
                ].join('\n')
            });
            const data = parseJsonMaybe(response);
            const html = data && typeof data === 'object'
                ? renderWordResult(data, word)
                : `<p>${escapeHtml(response)}</p>`;
            showPopover(point, `查询: ${word}`, html);
        } catch (error) {
            showPopover(point, `查询: ${word}`, `<p>${escapeHtml(error.message || String(error))}</p>`);
        }
    }

    async function translateSelection(text, point) {
        if (!ensureReady()) return;
        showPopover(point, '句子翻译', '<p>正在翻译...</p>');
        try {
            const response = await requestChat({
                system: 'You translate Reuters English into natural Simplified Chinese. Return compact JSON only.',
                user: [
                    'Translate the selected English sentence or passage into Simplified Chinese.',
                    'Keep names, numbers, organizations, and dates accurate.',
                    'Return JSON with keys: translation, note.',
                    `Text: ${text}`
                ].join('\n')
            });
            const data = parseJsonMaybe(response);
            const html = data && typeof data === 'object'
                ? renderTranslationResult(data)
                : `<p>${escapeHtml(response)}</p>`;
            showPopover(point, '句子翻译', html);
        } catch (error) {
            showPopover(point, '句子翻译', `<p>${escapeHtml(error.message || String(error))}</p>`);
        }
    }

    function ensureReady() {
        if (getConfigReady()) return true;
        showSettings();
        setStatus('需要先填写 API 地址、key 和模型。');
        return false;
    }

    async function analyzeSentences() {
        if (analyzeRunning) return;
        if (!ensureReady()) return;
        enhanceArticle();
        const pending = Array.from(sentences.values())
            .filter((item) => item.node.isConnected && !item.analyzed)
            .slice(0, MAX_ANALYSIS_SENTENCES);
        if (!pending.length) {
            setStatus('当前文章没有待分析的句子。');
            return;
        }
        analyzeRunning = true;
        setAnalyzeButtonState(true);
        try {
            let completed = 0;
            for (let index = 0; index < pending.length; index += ANALYSIS_BATCH_SIZE) {
                const batch = pending.slice(index, index + ANALYSIS_BATCH_SIZE);
                setStatus(`正在分析句子结构 ${completed}/${pending.length}...`);
                const results = await analyzeBatch(batch);
                for (const result of results) {
                    applyStructureResult(result);
                }
                completed += batch.length;
            }
            setStatus(`句子结构分析完成，共处理 ${pending.length} 句。`);
        } catch (error) {
            setStatus(`结构分析失败：${error.message || String(error)}`);
        } finally {
            analyzeRunning = false;
            setAnalyzeButtonState(false);
        }
    }

    function setAnalyzeButtonState(disabled) {
        if (!toolbarRoot) return;
        const button = toolbarRoot.querySelector('[data-rer-action="analyze"]');
        if (button) button.disabled = disabled;
    }

    async function analyzeBatch(batch) {
        const payload = batch.map(({ id, text }) => ({ id, text }));
        const response = await requestChat({
            system: [
                'You mark the main grammatical structure of Reuters English sentences for Chinese learners.',
                'Return JSON only. Do not include markdown.',
                'Use exact zero-based character offsets from the original sentence text.',
                'Allowed roles: subject, predicate, object, complement, modifier, connector.',
                'Prefer short, important spans. Do not overlap spans for the same sentence.'
            ].join(' '),
            user: [
                'For each sentence, identify major structure spans.',
                'Return an array like [{"id":"...","spans":[{"start":0,"end":5,"role":"subject"}]}].',
                'The end offset is exclusive. Keep spans exact.',
                JSON.stringify(payload)
            ].join('\n')
        });
        const parsed = parseJsonMaybe(response);
        if (!Array.isArray(parsed)) {
            throw new Error('模型没有返回可解析的结构 JSON。');
        }
        return parsed;
    }

    function applyStructureResult(result) {
        if (!result || typeof result !== 'object') return;
        const sentence = sentences.get(result.id);
        if (!sentence || !sentence.node) return;
        const spans = Array.isArray(result.spans) ? sanitizeSpans(result.spans, sentence.text) : [];
        renderSentenceWithSpans(sentence.node, sentence.text, spans);
        sentence.analyzed = true;
        sentence.node.classList.add('rer-analyzed');
    }

    function sanitizeSpans(spans, text) {
        const length = text.length;
        return spans
            .map((span) => ({
                start: Number(span.start),
                end: Number(span.end),
                role: normalizeRole(span.role)
            }))
            .filter((span) => Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end > span.start && span.end <= length && ROLE_CLASS[span.role])
            .sort((a, b) => a.start - b.start || b.end - a.end)
            .reduce((acc, span) => {
                const last = acc[acc.length - 1];
                if (last && span.start < last.end) return acc;
                acc.push(span);
                return acc;
            }, []);
    }

    function normalizeRole(role) {
        const value = String(role || '').toLowerCase().trim();
        if (value === 'verb' || value === 'predicate verb') return 'predicate';
        if (value === 'predicate') return 'predicate';
        if (value === 'subject') return 'subject';
        if (value === 'object') return 'object';
        if (value === 'complement') return 'complement';
        if (value === 'modifier' || value === 'adverbial' || value === 'attribute') return 'modifier';
        if (value === 'connector' || value === 'conjunction') return 'connector';
        return value;
    }

    function renderSentenceWithSpans(node, text, spans) {
        node.textContent = '';
        let cursor = 0;
        for (const span of spans) {
            if (span.start > cursor) {
                node.append(document.createTextNode(text.slice(cursor, span.start)));
            }
            const mark = document.createElement('span');
            mark.className = `rer-structure ${ROLE_CLASS[span.role]}`;
            mark.title = ROLE_LABEL[span.role] || span.role;
            mark.textContent = text.slice(span.start, span.end);
            node.append(mark);
            cursor = span.end;
        }
        if (cursor < text.length) {
            node.append(document.createTextNode(text.slice(cursor)));
        }
    }

    function requestChat({ system, user }) {
        const url = getChatCompletionsUrl();
        if (!url) return Promise.reject(new Error('API 地址为空。'));
        const body = {
            model: config.model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ],
            temperature: 0.2,
            stream: false
        };
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.apiKey}`
                },
                data: JSON.stringify(body),
                timeout: 45000,
                onload: (response) => {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(`API 请求失败 HTTP ${response.status}: ${String(response.responseText || '').slice(0, 180)}`));
                        return;
                    }
                    try {
                        const data = JSON.parse(response.responseText || '{}');
                        const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                        if (!content) {
                            reject(new Error('API 响应中没有 message.content。'));
                            return;
                        }
                        resolve(content.trim());
                    } catch (error) {
                        reject(new Error(`API 响应解析失败：${error.message || String(error)}`));
                    }
                },
                onerror: () => reject(new Error('API 网络请求失败。')),
                ontimeout: () => reject(new Error('API 请求超时。'))
            });
        });
    }

    function parseJsonMaybe(value) {
        const text = String(value || '').trim();
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch (_error) {
            const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
            if (fenced) {
                try {
                    return JSON.parse(fenced[1].trim());
                } catch (_nestedError) {
                    return null;
                }
            }
            const start = Math.min(
                ...['{', '['].map((character) => {
                    const position = text.indexOf(character);
                    return position === -1 ? Number.POSITIVE_INFINITY : position;
                })
            );
            const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
            if (Number.isFinite(start) && end > start) {
                try {
                    return JSON.parse(text.slice(start, end + 1));
                } catch (_sliceError) {
                    return null;
                }
            }
            return null;
        }
    }

    function renderWordResult(data, fallbackWord) {
        const word = data.word || fallbackWord;
        const partOfSpeech = data.partOfSpeech || data.pos || '';
        const meaning = data.meaning || data.meanings || '';
        const inSentence = data.inSentence || data.sense || '';
        const note = data.note || '';
        const meaningHtml = Array.isArray(meaning)
            ? `<ul class="rer-popover-list">${meaning.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
            : `<p>${escapeHtml(meaning)}</p>`;
        return [
            `<p><span class="rer-label">单词</span>${escapeHtml(word)}${partOfSpeech ? ` · ${escapeHtml(partOfSpeech)}` : ''}</p>`,
            meaningHtml,
            inSentence ? `<p><span class="rer-label">句中</span>${escapeHtml(inSentence)}</p>` : '',
            note ? `<p><span class="rer-label">提示</span>${escapeHtml(note)}</p>` : ''
        ].join('');
    }

    function renderTranslationResult(data) {
        const translation = data.translation || data.text || '';
        const note = data.note || data.explanation || '';
        return [
            translation ? `<p>${escapeHtml(translation)}</p>` : '',
            note ? `<p><span class="rer-label">注</span>${escapeHtml(note)}</p>` : ''
        ].join('') || '<p>没有得到翻译结果。</p>';
    }

    function showPopover(point, title, bodyHtml) {
        hidePopover();
        popoverRoot = document.createElement('section');
        popoverRoot.className = 'rer-popover';
        popoverRoot.setAttribute('role', 'dialog');
        popoverRoot.innerHTML = `
            <div class="rer-popover-header">
                <div class="rer-popover-title">${escapeHtml(title)}</div>
                <button type="button" class="rer-popover-close" aria-label="Close">×</button>
            </div>
            <div class="rer-popover-body">${bodyHtml}</div>
        `;
        popoverRoot.querySelector('.rer-popover-close').addEventListener('click', hidePopover);
        document.documentElement.append(popoverRoot);
        placePopover(popoverRoot, point);
    }

    function placePopover(node, point) {
        const margin = 12;
        const width = node.offsetWidth;
        const height = node.offsetHeight;
        let left = Number(point && point.x) || window.innerWidth / 2;
        let top = Number(point && point.y) || window.innerHeight / 2;
        left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);
        top = Math.min(Math.max(margin, top + 10), window.innerHeight - height - margin);
        node.style.left = `${Math.round(left)}px`;
        node.style.top = `${Math.round(top)}px`;
    }

    function hidePopover() {
        if (popoverRoot) popoverRoot.remove();
        popoverRoot = null;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
