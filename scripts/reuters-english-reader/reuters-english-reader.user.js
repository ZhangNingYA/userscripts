// ==UserScript==
// @name         Reuters English Reader
// @name:zh-CN   Reuters 英文精读助手
// @name:en      Reuters English Reader
// @namespace    https://scripts.fulafu.com/
// @version      0.7.0
// @description  Cached sentence-by-sentence Reuters reading with Chinese translations, key phrases, and concise core grammar highlighting through a user-configured OpenAI-compatible API.
// @description:zh-CN 为 Reuters 英文新闻自动缓存逐句译文、重点词组和精简主谓宾标记，API 信息由使用者本地配置。
// @description:en Cached sentence-by-sentence Reuters reading with Chinese translations, key phrases, and concise core grammar highlighting through a user-configured OpenAI-compatible API.
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

    const SCRIPT_VERSION = '0.7.0';
    const SCRIPT_RELEASED_AT = '2026-08-18 17:25:48 UTC+8';
    const CONFIG_KEY = 'reuters-english-reader-config-v2';
    const LEGACY_CONFIG_KEY = 'reuters-english-reader-config-v1';
    const ANALYSIS_CACHE_KEY = 'reuters-english-reader-analysis-v2';
    const SENTENCE_PREFIX = 'rer-s';
    const ANALYSIS_BATCH_SIZE = 3;
    const ANALYSIS_CONCURRENCY = 2;
    const CACHE_LIMIT = 400;
    const REQUEST_TIMEOUT_MS = 120000;
    const REQUEST_MAX_ATTEMPTS = 2;
    const REQUEST_RETRY_DELAY_MS = 1000;
    const REASONING_EFFORT = 'low';
    const DEFAULT_MODEL = 'gpt-5.6-luna';
    const DEFAULT_CONFIG = {
        endpoint: '',
        apiKey: '',
        model: DEFAULT_MODEL,
        enabled: true,
        autoAnalyze: true,
        defaultExpanded: false,
        sentencesPerLoad: 5,
        targetLanguage: 'Simplified Chinese'
    };
    const ROLE_CLASS = {
        subject: 'rer-role-subject',
        predicate: 'rer-role-predicate',
        object: 'rer-role-object',
        complement: 'rer-role-complement'
    };
    const ROLE_LABEL = {
        subject: '主语',
        predicate: '谓语',
        object: '宾语',
        complement: '补语'
    };

    let config = loadConfig();
    let analysisCache = loadAnalysisCache();
    let sentenceCounter = 0;
    let toolbarRoot = null;
    let settingsRoot = null;
    let statusNode = null;
    let analyzeRunning = false;
    let autoAnalyzeTimer = 0;
    let autoAnalyzeQueuedKey = '';
    let autoAnalyzedArticleKey = '';
    let analysisGeneration = 0;
    let queuedFullAnalysis = false;
    const sentences = new Map();
    const queuedSentenceIds = new Set();

    const css = String.raw`
        :root {
            --rer-ink: #18222d;
            --rer-muted: #63707d;
            --rer-line: rgba(38, 52, 66, 0.16);
            --rer-accent: #08796f;
            --rer-accent-strong: #055c56;
            --rer-warm: #a44b27;
            --rer-panel: #ffffff;
            --rer-soft: #f4f8f7;
            --rer-shadow: 0 16px 42px rgba(25, 38, 51, 0.2);
        }

        ::highlight(rer-role-subject) {
            background-color: rgba(22, 119, 255, 0.12);
            text-decoration: underline 2px #1677ff;
        }

        ::highlight(rer-role-predicate) {
            background-color: rgba(205, 55, 75, 0.12);
            text-decoration: underline 2px #cd374b;
        }

        ::highlight(rer-role-object) {
            background-color: rgba(21, 128, 61, 0.12);
            text-decoration: underline 2px #15803d;
        }

        ::highlight(rer-role-complement) {
            background-color: rgba(116, 76, 184, 0.12);
            text-decoration: underline 2px #744cb8;
        }

        .rer-detail-toggle {
            position: relative;
            display: inline-grid;
            box-sizing: border-box;
            place-items: center;
            width: 20px;
            height: 20px;
            margin: 0 0.16em;
            padding: 0;
            border: 0;
            border-radius: 4px;
            background: transparent;
            color: #73808c;
            cursor: pointer;
            box-shadow: none;
            letter-spacing: 0;
            text-decoration: none;
            touch-action: manipulation;
            user-select: none;
            vertical-align: 0.1em;
            transition: color 140ms ease, border-color 140ms ease, background-color 140ms ease, transform 140ms ease;
        }

        .rer-detail-toggle:hover,
        .rer-detail-toggle:focus-visible {
            background: rgba(8, 121, 111, 0.09);
            color: var(--rer-accent-strong);
            transform: translateY(-1px);
        }

        .rer-detail-toggle:focus-visible {
            outline: 2px solid rgba(8, 121, 111, 0.28);
            outline-offset: 1px;
        }

        .rer-translation-icon {
            display: block;
            width: 16px;
            height: 16px;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
            pointer-events: none;
        }

        .rer-detail-toggle.rer-detail-ready {
            color: var(--rer-accent);
        }

        .rer-detail-toggle.rer-detail-ready::after {
            content: "";
            position: absolute;
            right: 0;
            bottom: 0;
            width: 5px;
            height: 5px;
            border: 1px solid #ffffff;
            border-radius: 50%;
            background: #16a36a;
            box-shadow: 0 0 0 1px rgba(22, 163, 106, 0.14);
        }

        .rer-detail-toggle[aria-expanded="true"] {
            background: #eaf7f4;
            color: var(--rer-accent-strong);
        }

        .rer-detail-toggle[data-rer-loading="true"] {
            color: var(--rer-accent);
        }

        .rer-detail-toggle[data-rer-loading="true"] .rer-translation-icon {
            animation: rer-pulse 900ms ease-in-out infinite alternate;
        }

        @keyframes rer-pulse {
            from { opacity: 0.48; }
            to { opacity: 1; }
        }

        .rer-detail-panel {
            display: block;
            box-sizing: border-box;
            margin: 0 0 0.34em;
            padding: 0.25em 0.72em 0.72em;
            border-left: 3px solid rgba(8, 121, 111, 0.24);
            border-bottom: 1px solid rgba(38, 52, 66, 0.12);
            border-radius: 0 0 6px 6px;
            background: rgba(244, 248, 247, 0.72);
            color: var(--rer-ink);
            font: 13px/1.58 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            letter-spacing: 0;
        }

        .rer-detail-panel[hidden] {
            display: none !important;
        }

        .rer-detail-empty {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px 12px;
            padding: 0.35em 0 0;
        }

        .rer-detail-empty-copy {
            min-width: 0;
            color: var(--rer-muted);
            font-size: 12px;
            writing-mode: horizontal-tb;
        }

        .rer-detail-actions {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
        }

        .rer-detail-actions .rer-button {
            min-height: 30px;
            padding: 0 8px;
            font-size: 11px;
        }

        .rer-detail-section {
            display: grid;
            grid-template-columns: 62px minmax(0, 1fr);
            gap: 10px;
            padding: 0.52em 0;
            border-bottom: 1px solid rgba(38, 52, 66, 0.1);
        }

        .rer-detail-section:last-child {
            border-bottom: 0;
            padding-bottom: 0.2em;
        }

        .rer-detail-heading {
            color: var(--rer-muted);
            font-size: 11px;
            font-weight: 750;
            white-space: nowrap;
        }

        .rer-detail-content {
            min-width: 0;
            overflow-wrap: break-word;
            word-break: normal;
            writing-mode: horizontal-tb;
        }

        .rer-phrase-list,
        .rer-structure-list {
            display: grid;
            gap: 5px;
        }

        .rer-phrase-row,
        .rer-structure-row {
            display: grid;
            gap: 8px;
            align-items: baseline;
        }

        .rer-phrase-row {
            grid-template-columns: minmax(0, 0.9fr) minmax(120px, 1.1fr);
        }

        .rer-structure-row {
            grid-template-columns: 74px minmax(0, 1fr);
        }

        .rer-phrase-text {
            color: var(--rer-ink);
            font-weight: 700;
        }

        .rer-phrase-meaning {
            min-width: 0;
            color: var(--rer-muted);
            overflow-wrap: break-word;
            word-break: normal;
            writing-mode: horizontal-tb;
        }

        .rer-pattern-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding-bottom: 5px;
        }

        .rer-pattern {
            display: inline-flex;
            align-items: center;
            min-height: 22px;
            padding: 0 7px;
            border: 1px solid rgba(8, 121, 111, 0.24);
            border-radius: 5px;
            background: rgba(8, 121, 111, 0.07);
            color: var(--rer-accent-strong);
            font-size: 11px;
            font-weight: 800;
            white-space: nowrap;
        }

        .rer-role-label {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            color: var(--rer-muted);
            font-size: 11px;
            font-weight: 700;
        }

        .rer-role-label::before {
            content: "";
            width: 7px;
            height: 7px;
            border-radius: 999px;
            background: #8a96a3;
        }

        .rer-role-label[data-role="subject"]::before { background: #1677ff; }
        .rer-role-label[data-role="predicate"]::before { background: #cd374b; }
        .rer-role-label[data-role="object"]::before { background: #15803d; }
        .rer-role-label[data-role="complement"]::before { background: #744cb8; }

        .rer-toolbar,
        .rer-settings {
            box-sizing: border-box;
            color: var(--rer-ink);
            font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            letter-spacing: 0;
            z-index: 2147483646;
        }

        .rer-toolbar {
            position: fixed;
            top: 72px;
            right: 18px;
            display: flex;
            align-items: center;
            width: min(310px, calc(100vw - 24px));
            min-height: 48px;
            gap: 7px;
            padding: 6px 7px;
            border: 1px solid rgba(38, 52, 66, 0.17);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.97);
            box-shadow: var(--rer-shadow);
            backdrop-filter: blur(12px);
            overflow: hidden;
        }

        .rer-toolbar-summary {
            display: flex;
            align-items: center;
            flex: 1;
            min-width: 0;
            gap: 8px;
        }

        .rer-toolbar-mark {
            display: inline-grid;
            place-items: center;
            width: 28px;
            height: 28px;
            flex: 0 0 auto;
            border-radius: 6px;
            background: var(--rer-accent);
            color: #ffffff;
            font-size: 13px;
            font-weight: 800;
        }

        .rer-status {
            flex: 1;
            min-width: 0;
            color: var(--rer-muted);
            font-size: 11px;
            font-weight: 650;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .rer-toolbar-actions {
            display: flex;
            flex: 0 0 auto;
            gap: 6px;
        }

        .rer-button {
            appearance: none;
            min-width: 0;
            min-height: 34px;
            padding: 0 9px;
            border: 1px solid rgba(8, 121, 111, 0.28);
            border-radius: 6px;
            background: #f7fbfa;
            color: var(--rer-accent-strong);
            cursor: pointer;
            font: 650 12px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            letter-spacing: 0;
            white-space: nowrap;
            touch-action: manipulation;
        }

        .rer-button:hover,
        .rer-button:focus-visible {
            background: #eaf6f3;
            border-color: rgba(8, 121, 111, 0.5);
            outline: none;
        }

        .rer-button:disabled {
            cursor: wait;
            opacity: 0.58;
        }

        .rer-button-primary {
            border-color: var(--rer-accent);
            background: var(--rer-accent);
            color: #ffffff;
        }

        .rer-button-primary:hover,
        .rer-button-primary:focus-visible {
            background: var(--rer-accent-strong);
        }

        .rer-button-danger {
            border-color: rgba(190, 48, 57, 0.34);
            background: #fff7f7;
            color: #a12e38;
        }

        .rer-button-danger:hover,
        .rer-button-danger:focus-visible {
            border-color: rgba(190, 48, 57, 0.6);
            background: #ffeded;
        }

        .rer-toolbar .rer-button {
            min-height: 34px;
            padding: 0 10px;
        }

        .rer-settings-backdrop {
            position: fixed;
            inset: 0;
            z-index: 2147483645;
            background: rgba(12, 19, 27, 0.32);
        }

        .rer-settings {
            position: fixed;
            top: 72px;
            right: 16px;
            width: min(440px, calc(100vw - 32px));
            max-height: calc(100vh - 92px);
            overflow: auto;
            padding: 0;
            border: 1px solid rgba(38, 52, 66, 0.18);
            border-radius: 8px;
            background: var(--rer-panel);
            box-shadow: var(--rer-shadow);
        }

        .rer-settings-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 16px;
            border-bottom: 1px solid rgba(38, 52, 66, 0.11);
        }

        .rer-settings-header h2 {
            flex: 1;
            margin: 0;
            font-size: 17px;
            line-height: 1.25;
        }

        .rer-settings-close {
            appearance: none;
            width: 32px;
            height: 32px;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: var(--rer-muted);
            cursor: pointer;
            font-size: 20px;
            line-height: 1;
        }

        .rer-settings-close:hover,
        .rer-settings-close:focus-visible {
            background: rgba(38, 52, 66, 0.07);
            outline: none;
        }

        .rer-settings-body {
            padding: 14px 16px 4px;
        }

        .rer-settings-section {
            margin-bottom: 16px;
        }

        .rer-settings-section-title {
            margin: 0 0 8px;
            color: var(--rer-muted);
            font-size: 11px;
            font-weight: 750;
        }

        .rer-field {
            display: grid;
            gap: 5px;
            margin: 10px 0;
        }

        .rer-field label {
            color: var(--rer-ink);
            font-size: 12px;
            font-weight: 700;
        }

        .rer-field input[type="text"],
        .rer-field input[type="password"],
        .rer-field input[type="number"] {
            box-sizing: border-box;
            width: 100%;
            min-height: 38px;
            padding: 7px 9px;
            border: 1px solid rgba(38, 52, 66, 0.2);
            border-radius: 6px;
            color: var(--rer-ink);
            font: 13px/1.3 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            letter-spacing: 0;
        }

        .rer-field input:focus {
            border-color: rgba(8, 121, 111, 0.7);
            outline: 2px solid rgba(8, 121, 111, 0.14);
        }

        .rer-help {
            color: var(--rer-muted);
            font-size: 11px;
            line-height: 1.45;
        }

        .rer-setting-row {
            display: flex;
            align-items: center;
            gap: 12px;
            min-height: 44px;
            border-bottom: 1px solid rgba(38, 52, 66, 0.09);
        }

        .rer-setting-row:last-child {
            border-bottom: 0;
        }

        .rer-setting-copy {
            flex: 1;
            min-width: 0;
        }

        .rer-setting-name {
            color: var(--rer-ink);
            font-size: 13px;
            font-weight: 650;
        }

        .rer-switch {
            position: relative;
            width: 38px;
            height: 22px;
            flex: 0 0 auto;
        }

        .rer-switch input {
            position: absolute;
            width: 1px;
            height: 1px;
            opacity: 0;
        }

        .rer-switch-track {
            position: absolute;
            inset: 0;
            border-radius: 999px;
            background: #c9d0d6;
            cursor: pointer;
            transition: background-color 140ms ease;
        }

        .rer-switch-track::after {
            content: "";
            position: absolute;
            top: 3px;
            left: 3px;
            width: 16px;
            height: 16px;
            border-radius: 999px;
            background: #ffffff;
            box-shadow: 0 1px 3px rgba(20, 30, 40, 0.25);
            transition: transform 140ms ease;
        }

        .rer-switch input:checked + .rer-switch-track {
            background: var(--rer-accent);
        }

        .rer-switch input:checked + .rer-switch-track::after {
            transform: translateX(16px);
        }

        .rer-switch input:focus-visible + .rer-switch-track {
            outline: 2px solid rgba(8, 121, 111, 0.3);
            outline-offset: 2px;
        }

        .rer-settings-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 16px;
            border-top: 1px solid rgba(38, 52, 66, 0.11);
            background: #fafbfb;
        }

        .rer-settings-version {
            color: var(--rer-muted);
            font-size: 10px;
        }

        .rer-settings-actions {
            display: flex;
            gap: 8px;
        }

        @media (max-width: 560px) {
            .rer-toolbar {
                top: 62px;
                right: 12px;
                width: min(300px, calc(100vw - 24px));
            }

            .rer-settings {
                top: 62px;
                right: 10px;
                width: calc(100vw - 20px);
                max-height: calc(100vh - 72px);
            }

            .rer-detail-section {
                grid-template-columns: 1fr;
                gap: 3px;
            }

            .rer-phrase-row {
                grid-template-columns: minmax(0, 1fr);
                gap: 2px;
            }

            .rer-structure-row {
                grid-template-columns: 64px minmax(0, 1fr);
            }

            .rer-settings-footer {
                flex-wrap: wrap;
            }
        }
    `;

    function init() {
        GM_addStyle(css);
        registerMenu();
        if (!config.enabled) return;
        document.documentElement.classList.add('rer-reading-active');
        buildToolbar();
        installInteractionHandlers();
        enhanceArticle();
        observePageChanges();
        updateLoadedCount();
    }

    function loadConfig() {
        const stored = safeGetValue(CONFIG_KEY, null);
        if (stored && typeof stored === 'object') {
            return normalizeConfig(stored);
        }
        const legacy = safeGetValue(LEGACY_CONFIG_KEY, null);
        const migrated = legacy && typeof legacy === 'object'
            ? {
                ...DEFAULT_CONFIG,
                endpoint: legacy.endpoint || '',
                apiKey: legacy.apiKey || '',
                model: legacy.model || DEFAULT_MODEL,
                targetLanguage: legacy.targetLanguage || DEFAULT_CONFIG.targetLanguage
            }
            : { ...DEFAULT_CONFIG };
        safeSetValue(CONFIG_KEY, migrated);
        return normalizeConfig(migrated);
    }

    function saveConfig(nextConfig) {
        config = normalizeConfig(nextConfig);
        safeSetValue(CONFIG_KEY, config);
    }

    function normalizeConfig(value) {
        const normalized = { ...DEFAULT_CONFIG, ...(value || {}) };
        normalized.sentencesPerLoad = Math.min(10, Math.max(1, Math.round(Number(normalized.sentencesPerLoad) || 5)));
        delete normalized.toolbarCollapsed;
        return normalized;
    }

    function loadAnalysisCache() {
        const stored = safeGetValue(ANALYSIS_CACHE_KEY, {});
        return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    }

    function saveAnalysisCache() {
        const entries = Object.entries(analysisCache);
        if (entries.length > CACHE_LIMIT) {
            entries.sort((a, b) => Number(b[1] && b[1].savedAt) - Number(a[1] && a[1].savedAt));
            analysisCache = Object.fromEntries(entries.slice(0, CACHE_LIMIT));
        }
        safeSetValue(ANALYSIS_CACHE_KEY, analysisCache);
    }

    function safeGetValue(key, fallback) {
        try {
            return GM_getValue(key, fallback);
        } catch (error) {
            console.warn('[Reuters English Reader] Failed to read storage', error);
            return fallback;
        }
    }

    function safeSetValue(key, value) {
        try {
            GM_setValue(key, value);
        } catch (error) {
            console.warn('[Reuters English Reader] Failed to save storage', error);
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
            <div class="rer-toolbar-summary">
                <span class="rer-toolbar-mark" aria-hidden="true">R</span>
                <span class="rer-status" data-rer-status aria-live="polite">已加载 0 句</span>
            </div>
            <div class="rer-toolbar-actions">
                <button type="button" class="rer-button rer-button-primary" data-rer-action="continue">继续</button>
                <button type="button" class="rer-button" data-rer-action="load-all" aria-label="加载全文" title="加载全文">全文</button>
                <button type="button" class="rer-button" data-rer-action="settings">设置</button>
            </div>
        `;
        statusNode = toolbarRoot.querySelector('[data-rer-status]');
        toolbarRoot.addEventListener('click', handleToolbarClick);
        document.documentElement.append(toolbarRoot);
        updateLoadedCount();
    }

    function handleToolbarClick(event) {
        const button = event.target.closest('[data-rer-action]');
        if (!button) return;
        const action = button.getAttribute('data-rer-action');
        if (action === 'settings') {
            showSettings();
        } else if (action === 'continue') {
            analyzeSentences();
        } else if (action === 'load-all') {
            requestFullArticleAnalysis();
        }
    }

    function updateLoadedCount() {
        const ready = getConnectedReadingItems().filter((item) => item.ready).length;
        if (statusNode) statusNode.textContent = `已加载 ${ready} 句`;
    }

    function registerMenu() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        GM_registerMenuCommand('Reuters Reader: 设置', showSettings);
        GM_registerMenuCommand('Reuters Reader: 继续精读', () => analyzeSentences());
        GM_registerMenuCommand('Reuters Reader: 加载全文', requestFullArticleAnalysis);
    }

    function showSettings() {
        closeSettings();
        const backdrop = document.createElement('div');
        backdrop.className = 'rer-settings-backdrop';
        const panel = document.createElement('section');
        panel.className = 'rer-settings';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', 'Reuters English Reader settings');
        panel.innerHTML = `
            <div class="rer-settings-header">
                <h2>Reuters 精读设置</h2>
                <button type="button" class="rer-settings-close" data-rer-settings="cancel" aria-label="关闭" title="关闭">&times;</button>
            </div>
            <div class="rer-settings-body">
                <div class="rer-settings-section">
                    <div class="rer-settings-section-title">API</div>
                    <div class="rer-field">
                        <label for="rer-endpoint">API 地址</label>
                        <input id="rer-endpoint" type="text" autocomplete="off" spellcheck="false" placeholder="https://example.com/v1/chat/completions">
                    </div>
                    <div class="rer-field">
                        <label for="rer-key">API key</label>
                        <input id="rer-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-...">
                    </div>
                    <div class="rer-field">
                        <label for="rer-model">模型</label>
                        <input id="rer-model" type="text" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(DEFAULT_MODEL)}">
                    </div>
                    <div class="rer-help">API key 只保存在本地 userscript 存储中。</div>
                </div>
                <div class="rer-settings-section">
                    <div class="rer-settings-section-title">阅读行为</div>
                    ${renderSettingSwitch('rer-enabled', '启用精读', '刷新页面后完整生效')}
                    ${renderSettingSwitch('rer-auto', '自动加载', '首次打开文章时只准备第一批')}
                    ${renderSettingSwitch('rer-expanded', '默认展开', '加载完成后直接显示句子精读')}
                    <div class="rer-field">
                        <label for="rer-sentences-per-load">每批句数</label>
                        <input id="rer-sentences-per-load" type="number" min="1" max="10" step="1" inputmode="numeric">
                        <div class="rer-help">首次自动加载和每次“继续”使用相同数量，范围 1-10 句。</div>
                    </div>
                </div>
                <div class="rer-settings-section">
                    <div class="rer-settings-section-title">数据管理</div>
                    <div class="rer-setting-row">
                        <div class="rer-setting-copy">
                            <div class="rer-setting-name">清除精读缓存</div>
                            <div class="rer-help">删除已保存的译文、词组和句子主干；不会删除 API 设置。</div>
                        </div>
                        <button type="button" class="rer-button rer-button-danger" data-rer-settings="clear-cache">清除</button>
                    </div>
                </div>
            </div>
            <div class="rer-settings-footer">
                <div class="rer-settings-version">v${escapeHtml(SCRIPT_VERSION)} · ${escapeHtml(SCRIPT_RELEASED_AT)}</div>
                <div class="rer-settings-actions">
                    <button type="button" class="rer-button" data-rer-settings="cancel">取消</button>
                    <button type="button" class="rer-button rer-button-primary" data-rer-settings="save">保存</button>
                </div>
            </div>
        `;
        settingsRoot = document.createElement('div');
        settingsRoot.append(backdrop, panel);
        document.documentElement.append(settingsRoot);

        const endpointInput = panel.querySelector('#rer-endpoint');
        const keyInput = panel.querySelector('#rer-key');
        const modelInput = panel.querySelector('#rer-model');
        const sentencesPerLoadInput = panel.querySelector('#rer-sentences-per-load');
        endpointInput.value = config.endpoint || '';
        keyInput.value = config.apiKey || '';
        modelInput.value = config.model || DEFAULT_MODEL;
        sentencesPerLoadInput.value = String(config.sentencesPerLoad);
        panel.querySelector('#rer-enabled').checked = Boolean(config.enabled);
        panel.querySelector('#rer-auto').checked = Boolean(config.autoAnalyze);
        panel.querySelector('#rer-expanded').checked = Boolean(config.defaultExpanded);

        backdrop.addEventListener('click', closeSettings);
        panel.addEventListener('click', (event) => {
            const button = event.target.closest('[data-rer-settings]');
            if (!button) return;
            const action = button.getAttribute('data-rer-settings');
            if (action === 'cancel') {
                closeSettings();
                return;
            }
            if (action === 'clear-cache') {
                if (!window.confirm('清除所有已保存的精读结果，并还原当前页面吗？API 设置不会被删除。')) return;
                clearAnalysisCache();
                closeSettings();
                return;
            }
            if (action !== 'save') return;
            const nextConfig = {
                endpoint: cleanEndpoint(endpointInput.value),
                apiKey: keyInput.value.trim(),
                model: modelInput.value.trim() || DEFAULT_MODEL,
                enabled: panel.querySelector('#rer-enabled').checked,
                autoAnalyze: panel.querySelector('#rer-auto').checked,
                defaultExpanded: panel.querySelector('#rer-expanded').checked,
                sentencesPerLoad: sentencesPerLoadInput.value,
                targetLanguage: DEFAULT_CONFIG.targetLanguage
            };
            saveConfig(nextConfig);
            closeSettings();
            buildToolbar();
            updateLoadedCount();
            if (config.enabled && config.autoAnalyze && getConfigReady()) queueAutoAnalyze();
        });
        endpointInput.focus();
    }

    function renderSettingSwitch(id, name, help) {
        return `
            <div class="rer-setting-row">
                <div class="rer-setting-copy">
                    <div class="rer-setting-name">${escapeHtml(name)}</div>
                    <div class="rer-help">${escapeHtml(help)}</div>
                </div>
                <label class="rer-switch">
                    <input id="${escapeHtml(id)}" type="checkbox">
                    <span class="rer-switch-track"></span>
                </label>
            </div>
        `;
    }

    function closeSettings() {
        if (settingsRoot) settingsRoot.remove();
        settingsRoot = null;
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
        if (!config.enabled) return;
        const root = findArticleRoot();
        if (!root) {
            updateLoadedCount();
            return;
        }
        const readingElements = collectReadingElements(root);
        let changed = 0;
        for (const { element, isHeadline, isLinkedTitle } of readingElements) {
            if (element.dataset.rerReadingElement === 'true') continue;
            const textMap = buildTextMap(element);
            const text = textMap.text;
            const isTitle = isHeadline || isLinkedTitle;
            if (!shouldProcessReadingElement(text, element, isTitle)) continue;
            const parts = isTitle
                ? [{ text, start: 0, end: text.length }]
                : segmentSentenceRanges(text);
            if (!parts.length) continue;
            element.dataset.rerReadingElement = 'true';
            const prepared = parts.map((part) => {
                const id = `${SENTENCE_PREFIX}-${++sentenceCounter}`;
                const toggleNode = document.createElement('span');
                toggleNode.className = 'rer-detail-toggle rer-inline-control';
                toggleNode.dataset.rerSentenceToggle = id;
                toggleNode.dataset.rerLoading = 'false';
                toggleNode.setAttribute('role', 'button');
                toggleNode.setAttribute('tabindex', '0');
                toggleNode.setAttribute('aria-expanded', String(Boolean(config.defaultExpanded)));
                toggleNode.setAttribute('aria-label', '查看本句精读');
                toggleNode.title = '查看本句精读';
                toggleNode.innerHTML = `
                    <svg class="rer-translation-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="m5 8 6 6"></path>
                        <path d="m4 14 6-6 2-3"></path>
                        <path d="M2 5h12"></path>
                        <path d="M7 2h1"></path>
                        <path d="m22 22-5-10-5 10"></path>
                        <path d="M14 18h6"></path>
                    </svg>
                `;
                const detailNode = document.createElement('span');
                detailNode.className = 'rer-detail-panel';
                detailNode.dataset.rerSentenceDetail = id;
                detailNode.hidden = !config.defaultExpanded;
                const item = {
                    id,
                    text: part.text,
                    start: part.start,
                    end: part.end,
                    order: sentenceCounter,
                    element,
                    toggleNode,
                    detailNode,
                    analysis: null,
                    ready: false,
                    loading: false,
                    queued: false
                };
                installSentenceToggleHandlers(item);
                renderUnloadedDetail(item);
                return item;
            });
            for (const item of prepared.slice().reverse()) {
                insertSentenceControls(item, textMap, isLinkedTitle);
            }
            for (const item of prepared) {
                sentences.set(item.id, item);
                restoreCachedAnalysis(item);
            }
            changed += 1;
        }
        if (changed > 0) {
            updateLoadedCount();
            updateStructureHighlights();
            if (config.autoAnalyze && getConfigReady()) queueAutoAnalyze();
        }
    }

    function buildTextMap(element) {
        const positions = [];
        let text = '';
        let pendingSpace = null;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!node.data || !parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('.rer-inline-control, .rer-detail-panel, script, style, noscript')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        let node = walker.nextNode();
        while (node) {
            for (let offset = 0; offset < node.data.length; offset += 1) {
                const character = node.data[offset];
                if (/\s/.test(character)) {
                    if (text && !pendingSpace) pendingSpace = { node, start: offset, end: offset + 1 };
                    continue;
                }
                if (pendingSpace && !/[,.;:!?]/.test(character)) {
                    text += ' ';
                    positions.push(pendingSpace);
                }
                pendingSpace = null;
                text += character;
                positions.push({ node, start: offset, end: offset + 1 });
            }
            node = walker.nextNode();
        }
        return { text, positions };
    }

    function segmentSentenceRanges(text) {
        const ranges = [];
        let cursor = 0;
        for (const sentenceText of segmentSentences(text)) {
            const start = text.indexOf(sentenceText, cursor);
            if (start < 0) continue;
            const end = start + sentenceText.length;
            ranges.push({ text: sentenceText, start, end });
            cursor = end;
        }
        return ranges;
    }

    function insertSentenceControls(item, textMap, isLinkedTitle) {
        const point = textMap.positions[item.end - 1];
        if (!point || !point.node.isConnected) return;
        const endingLink = point.node.parentElement && point.node.parentElement.closest('a');
        const range = document.createRange();
        range.setStart(point.node, point.end);
        range.collapse(true);
        range.insertNode(item.toggleNode);
        if (isLinkedTitle) {
            item.element.after(item.detailNode);
        } else if (endingLink && item.element.contains(endingLink)) {
            endingLink.after(item.detailNode);
        } else {
            item.toggleNode.after(item.detailNode);
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
            if (element && element.textContent && element.textContent.trim().length > 400) return element;
        }
        return null;
    }

    function collectReadingElements(root) {
        const headline = findHeadline(root);
        const elements = [];
        const seen = new Set();
        const add = (element, isHeadline = false, isLinkedTitle = false) => {
            if (!element || seen.has(element)) return;
            seen.add(element);
            elements.push({ element, isHeadline, isLinkedTitle });
        };
        add(headline, true, false);
        for (const linkedTitle of collectLinkedTitles(root, headline)) add(linkedTitle, false, true);
        for (const paragraph of collectParagraphs(root)) {
            add(paragraph, false, false);
        }
        return elements;
    }

    function collectLinkedTitles(root, headline) {
        const selectors = [
            'h2 a[href]',
            'h3 a[href]',
            'h4 a[href]',
            'a[data-testid*="heading" i][href]',
            'a[data-testid*="headline" i][href]',
            'a[data-testid*="title" i][href]',
            '[data-testid*="heading" i] a[href]',
            '[data-testid*="headline" i] a[href]',
            '[data-testid*="title" i] a[href]'
        ].join(',');
        const scopes = [root, document.querySelector('main')].filter(Boolean);
        const linkedTitles = [];
        const seen = new Set();
        for (const scope of scopes) {
            for (const anchor of scope.querySelectorAll(selectors)) {
                if (!(anchor instanceof HTMLAnchorElement)
                    || seen.has(anchor)
                    || (headline && headline.contains(anchor))
                    || anchor.closest('p, nav, footer, aside, form')) continue;
                seen.add(anchor);
                linkedTitles.push(anchor);
            }
        }
        return linkedTitles;
    }

    function findHeadline(root) {
        const candidates = [
            root.matches('h1') ? root : null,
            root.querySelector('h1'),
            document.querySelector('main h1'),
            document.querySelector('h1[data-testid*="heading" i]'),
            document.querySelector('article h1'),
            document.querySelector('h1')
        ];
        return candidates.find((node) => {
            if (!(node instanceof HTMLElement)) return false;
            const text = normalizeReadingText(node.textContent);
            if (text.length < 12 || !/[A-Za-z]/.test(text)) return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 0 || rect.height > 0;
        }) || null;
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
            if (!(node instanceof HTMLElement) || seen.has(node)) continue;
            seen.add(node);
            unique.push(node);
        }
        return unique;
    }

    function shouldProcessReadingElement(text, element, isHeadline) {
        const minimumLength = isHeadline ? 12 : 45;
        if (!text || text.length < minimumLength || !/[A-Za-z]/.test(text)) return false;
        if (element.closest('.rer-toolbar, .rer-settings, nav, footer, aside, form, button')) return false;
        if (element.querySelector('time, button, input, textarea, select')) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        return !/^(our standards|click here|sign up|reporting by|editing by)\b/i.test(text);
    }

    function getConnectedReadingItems() {
        return Array.from(sentences.values())
            .filter((item) => item.toggleNode.isConnected && item.element.isConnected)
            .sort((left, right) => {
                if (left.toggleNode === right.toggleNode) return 0;
                const position = left.toggleNode.compareDocumentPosition(right.toggleNode);
                if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
                if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
                return left.order - right.order;
            });
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
            const actionNode = event.target.closest('[data-rer-sentence-action]');
            if (!actionNode) return;
            const item = sentences.get(actionNode.dataset.rerSentenceId);
            if (!item) return;
            const action = actionNode.dataset.rerSentenceAction;
            if (action === 'load-one') {
                setDetailExpanded(item, true);
                analyzeSentences({ items: [item] });
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeSettings();
        });
    }

    function installSentenceToggleHandlers(item) {
        const activate = (event) => {
            event.preventDefault();
            event.stopPropagation();
            setDetailExpanded(item, item.toggleNode.getAttribute('aria-expanded') !== 'true');
        };
        item.toggleNode.addEventListener('click', activate);
        item.toggleNode.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            activate(event);
        });
    }

    function setDetailExpanded(item, expanded) {
        item.toggleNode.setAttribute('aria-expanded', String(expanded));
        item.detailNode.hidden = !expanded;
        updateDetailToggleLabel(item);
        updateStructureHighlights();
    }

    function updateStructureHighlights() {
        if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight !== 'function') return;
        const rangesByRole = Object.fromEntries(Object.keys(ROLE_CLASS).map((role) => [role, []]));
        const mapByElement = new Map();
        for (const item of getConnectedReadingItems()) {
            if (!item.ready
                || !item.analysis
                || item.toggleNode.getAttribute('aria-expanded') !== 'true') continue;
            let textMap = mapByElement.get(item.element);
            if (!textMap) {
                textMap = buildTextMap(item.element);
                mapByElement.set(item.element, textMap);
            }
            if (textMap.text.slice(item.start, item.end) !== item.text) continue;
            for (const span of item.analysis.spans) {
                const start = textMap.positions[item.start + span.start];
                const end = textMap.positions[item.start + span.end - 1];
                if (!start || !end || !start.node.isConnected || !end.node.isConnected) continue;
                try {
                    const range = document.createRange();
                    range.setStart(start.node, start.start);
                    range.setEnd(end.node, end.end);
                    rangesByRole[span.role].push(range);
                } catch (error) {
                    console.warn('[Reuters English Reader] Failed to map structure highlight', error);
                }
            }
        }
        for (const [role, name] of Object.entries(ROLE_CLASS)) {
            CSS.highlights.delete(name);
            if (rangesByRole[role].length) CSS.highlights.set(name, new Highlight(...rangesByRole[role]));
        }
    }

    function updateDetailToggleLabel(item) {
        const expanded = item.toggleNode.getAttribute('aria-expanded') === 'true';
        let message = '查看本句精读';
        item.toggleNode.dataset.rerLoading = String(Boolean(item.loading || item.queued));
        if (item.ready) {
            message = expanded ? '收起本句精读' : '查看本句精读';
        } else if (item.loading) {
            message = '精读加载中';
        } else if (item.queued) {
            message = '本句等待加载';
        } else {
            message = '本句精读尚未加载';
        }
        item.toggleNode.setAttribute('aria-label', message);
        item.toggleNode.title = message;
    }

    function queueAutoAnalyze() {
        const articleKey = `${location.origin}${location.pathname}`;
        if (autoAnalyzedArticleKey === articleKey) return;
        window.clearTimeout(autoAnalyzeTimer);
        autoAnalyzeQueuedKey = articleKey;
        autoAnalyzeTimer = window.setTimeout(() => {
            if (autoAnalyzeQueuedKey !== articleKey
                || articleKey !== `${location.origin}${location.pathname}`
                || !config.enabled
                || !config.autoAnalyze
                || !getConfigReady()) return;
            autoAnalyzeQueuedKey = '';
            autoAnalyzedArticleKey = articleKey;
            analyzeSentences({ automatic: true });
        }, 700);
    }

    function restoreCachedAnalysis(item) {
        const cached = analysisCache[getSentenceCacheKey(item.text)];
        if (!cached || cached.text !== item.text || !cached.translation) return false;
        return applyAnalysisResult({ ...cached, id: item.id }, false);
    }

    function getSentenceCacheKey(text) {
        const value = `v2\n${config.model}\n${config.targetLanguage}\n${text}`;
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `s-${(hash >>> 0).toString(16)}`;
    }

    function cacheAnalysis(item, result) {
        analysisCache[getSentenceCacheKey(item.text)] = {
            text: item.text,
            translation: result.translation,
            phrases: result.phrases,
            pattern: result.pattern,
            spans: result.spans,
            savedAt: Date.now()
        };
    }

    function clearAnalysisCache() {
        analysisGeneration += 1;
        window.clearTimeout(autoAnalyzeTimer);
        autoAnalyzeQueuedKey = '';
        autoAnalyzedArticleKey = `${location.origin}${location.pathname}`;
        queuedFullAnalysis = false;
        queuedSentenceIds.clear();
        analysisCache = {};
        safeSetValue(ANALYSIS_CACHE_KEY, analysisCache);

        for (const item of getConnectedReadingItems()) {
            item.ready = false;
            item.loading = false;
            item.queued = false;
            item.analysis = null;
            item.toggleNode.classList.remove('rer-detail-ready');
            renderUnloadedDetail(item);
            item.toggleNode.setAttribute('aria-expanded', 'false');
            item.detailNode.hidden = true;
            updateDetailToggleLabel(item);
        }
        updateStructureHighlights();
        updateLoadedCount();
    }

    function ensureReady() {
        if (getConfigReady()) return true;
        showSettings();
        return false;
    }

    async function analyzeSentences(options = {}) {
        if (!config.enabled) return;
        if (analyzeRunning) {
            queueAnalysisRequest(options);
            return;
        }
        if (!ensureReady()) return;
        enhanceArticle();
        const ordered = getConnectedReadingItems();
        const requestedItems = Array.isArray(options.items) ? new Set(options.items) : null;
        const candidates = requestedItems
            ? ordered.filter((item) => requestedItems.has(item))
            : ordered;
        const available = candidates.filter((item) => !item.ready
            && !item.loading
            && (!item.queued || requestedItems || options.all));
        const pending = options.all || requestedItems
            ? available
            : available.slice(0, config.sentencesPerLoad);
        if (!pending.length) {
            updateLoadedCount();
            return;
        }
        const runGeneration = analysisGeneration;
        analyzeRunning = true;
        setContinueButtonState(true);
        for (const item of pending) {
            item.queued = false;
            queuedSentenceIds.delete(item.id);
            item.loading = true;
            setDetailMessage(item, '正在后台准备本句精读...');
            updateDetailToggleLabel(item);
        }
        const batches = [];
        for (let index = 0; index < pending.length; index += ANALYSIS_BATCH_SIZE) {
            batches.push(pending.slice(index, index + ANALYSIS_BATCH_SIZE));
        }
        let nextBatch = 0;
        const failures = new Set();
        const worker = async () => {
            while (nextBatch < batches.length) {
                const batch = batches[nextBatch++];
                try {
                    const results = await analyzeBatchWithFallback(batch);
                    if (runGeneration !== analysisGeneration) continue;
                    const appliedIds = new Set();
                    for (const result of results) {
                        if (!result || !result.id) continue;
                        if (applyAnalysisResult(result, true)) appliedIds.add(result.id);
                    }
                    for (const item of batch) {
                        if (!appliedIds.has(item.id)) failures.add(item);
                    }
                    if (runGeneration === analysisGeneration) saveAnalysisCache();
                } catch (error) {
                    for (const item of batch) failures.add(item);
                    console.warn('[Reuters English Reader] Analysis batch failed', error);
                }
                updateLoadedCount();
            }
        };
        try {
            const workerCount = Math.min(ANALYSIS_CONCURRENCY, batches.length);
            await Promise.all(Array.from({ length: workerCount }, () => worker()));
            if (runGeneration === analysisGeneration) saveAnalysisCache();
            if (failures.size) console.info(`[Reuters English Reader] ${failures.size} sentence(s) remain unloaded.`);
        } finally {
            for (const item of pending) {
                item.loading = false;
                if (!item.ready) {
                    renderUnloadedDetail(item, failures.has(item) ? '加载失败，请重试。' : '本句尚未精读');
                }
                updateDetailToggleLabel(item);
            }
            analyzeRunning = false;
            setContinueButtonState(false);
            updateLoadedCount();
            window.setTimeout(drainQueuedAnalysis, 0);
        }
    }

    function queueAnalysisRequest(options) {
        if (options.all) {
            queuedFullAnalysis = true;
            return;
        }
        if (!Array.isArray(options.items)) return;
        for (const item of options.items) {
            if (!item || item.ready || item.loading || item.queued) continue;
            item.queued = true;
            queuedSentenceIds.add(item.id);
            setDetailMessage(item, '已加入加载队列...');
            updateDetailToggleLabel(item);
        }
    }

    function drainQueuedAnalysis() {
        if (analyzeRunning) return;
        if (queuedFullAnalysis) {
            queuedFullAnalysis = false;
            for (const id of queuedSentenceIds) {
                const item = sentences.get(id);
                if (item) item.queued = false;
            }
            queuedSentenceIds.clear();
            analyzeSentences({ all: true });
            return;
        }
        const items = Array.from(queuedSentenceIds, (id) => sentences.get(id)).filter(Boolean);
        queuedSentenceIds.clear();
        if (items.length) analyzeSentences({ items });
    }

    function requestFullArticleAnalysis() {
        if (!config.enabled || !ensureReady()) return;
        enhanceArticle();
        const remaining = getConnectedReadingItems().filter((item) => !item.ready).length;
        if (!remaining) {
            window.alert('本文已经全部加载。');
            return;
        }
        if (!window.confirm(`将加载本文尚未完成的 ${remaining} 句，可能产生较多 API 请求。继续吗？`)) return;
        analyzeSentences({ all: true });
    }

    async function analyzeBatchWithFallback(batch, retryInvalid = true) {
        try {
            return await analyzeBatch(batch);
        } catch (error) {
            const canSplit = error.code === 'timeout' || error.code === 'invalid-analysis';
            if (batch.length === 1) {
                if (error.code === 'invalid-analysis' && retryInvalid) {
                    return analyzeBatchWithFallback(batch, false);
                }
                throw error;
            }
            if (!canSplit) throw error;
            const splitAt = Math.ceil(batch.length / 2);
            const first = await analyzeBatchWithFallback(batch.slice(0, splitAt));
            const second = await analyzeBatchWithFallback(batch.slice(splitAt));
            return first.concat(second);
        }
    }

    function setContinueButtonState(disabled) {
        if (!toolbarRoot) return;
        const button = toolbarRoot.querySelector('[data-rer-action="continue"]');
        if (button) button.disabled = disabled;
    }

    async function analyzeBatch(batch) {
        const payload = batch.map(({ id, text }) => ({ id, text }));
        const response = await requestChat({
            system: [
                'You create concise Chinese reading notes for Reuters English sentences.',
                'Return JSON only, without markdown.',
                'For each sentence return id, translation, phrases, pattern, and spans.',
                'phrases contains 1 to 3 difficult or important phrases as {text, meaning}.',
                'pattern must be exactly one of SV, SVO, SVC, or SVOC.',
                'spans uses exact zero-based character offsets and only roles subject, predicate, object, complement.',
                'Mark only the shortest main-clause core: at most one span per role and at most four spans total.',
                'For an active transitive main verb, always include its direct object and use SVO or SVOC.',
                'For a linking verb, include its subject complement and use SVC.',
                'For an intransitive or passive clause with no grammatical object, use SV and do not invent an object.',
                'Include auxiliaries in the shortest complete predicate.',
                'Never mark modifiers, connectors, or the whole sentence.'
            ].join(' '),
            user: [
                'Translate each sentence into natural Simplified Chinese, explain its key phrases, and identify only its core clause structure.',
                'Return an array like [{"id":"rer-s-1","translation":"...","phrases":[{"text":"...","meaning":"..."}],"pattern":"SVO","spans":[{"text":"Reuters","start":0,"end":7,"role":"subject"}]}].',
                'Keep names, numbers, organizations, and dates accurate. Offsets must match the original text exactly.',
                JSON.stringify(payload)
            ].join('\n')
        }, { splitOnTimeout: batch.length > 1 });
        const parsed = parseJsonMaybe(response);
        const sourceById = new Map(batch.map((item) => [item.id, item]));
        if (!Array.isArray(parsed)
            || parsed.length < batch.length
            || !parsed.every((result) => isAnalysisResultValid(result, sourceById.get(result && result.id)))) {
            throw createRequestError('模型没有返回可解析的精读 JSON。', false, 'invalid-analysis');
        }
        return parsed;
    }

    function isAnalysisResultValid(result, item) {
        if (!result || !item || !normalizeReadingText(result.translation || result.text || '')) return false;
        const spans = sanitizeSpans(result.spans, item.text);
        const derivedPattern = deriveStructurePattern(spans);
        const statedPattern = normalizeStructurePattern(result.pattern);
        return derivedPattern !== '未完整识别' && statedPattern === derivedPattern;
    }

    function normalizeStructurePattern(value) {
        const pattern = String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
        return ['SV', 'SVO', 'SVC', 'SVOC'].includes(pattern) ? pattern : '';
    }

    function applyAnalysisResult(result, persist) {
        if (!result || typeof result !== 'object') return false;
        const item = sentences.get(result.id);
        if (!item
            || !item.element
            || !item.element.isConnected
            || !item.toggleNode.isConnected
            || !item.detailNode.isConnected) return false;
        const translation = normalizeReadingText(result.translation || result.text || '');
        if (!translation) return false;
        const phrases = sanitizePhrases(result.phrases);
        const spans = sanitizeSpans(result.spans, item.text);
        const pattern = deriveStructurePattern(spans);
        const normalized = { translation, phrases, pattern, spans };
        try {
            renderSentenceDetail(item, normalized);
        } catch (error) {
            console.warn('[Reuters English Reader] Failed to render sentence analysis', error);
            return false;
        }
        if (!item.detailNode.textContent.includes(translation)) return false;
        item.ready = true;
        item.loading = false;
        item.queued = false;
        queuedSentenceIds.delete(item.id);
        item.analysis = normalized;
        item.toggleNode.classList.add('rer-detail-ready');
        updateDetailToggleLabel(item);
        updateStructureHighlights();
        if (persist) cacheAnalysis(item, normalized);
        return true;
    }

    function sanitizePhrases(phrases) {
        if (!Array.isArray(phrases)) return [];
        return phrases
            .map((phrase) => ({
                text: normalizeReadingText(phrase && (phrase.text || phrase.phrase)),
                meaning: normalizeReadingText(phrase && (phrase.meaning || phrase.explanation))
            }))
            .filter((phrase) => phrase.text && phrase.meaning)
            .slice(0, 3);
    }

    function sanitizeSpans(spans, text) {
        if (!Array.isArray(spans)) return [];
        const seenRoles = new Set();
        return spans
            .map((span) => normalizeSpan(span, text))
            .filter((span) => Number.isInteger(span.start)
                && Number.isInteger(span.end)
                && span.start >= 0
                && span.end > span.start
                && span.end <= text.length
                && ROLE_CLASS[span.role])
            .sort((a, b) => a.start - b.start || b.end - a.end)
            .reduce((accepted, span) => {
                const last = accepted[accepted.length - 1];
                if (seenRoles.has(span.role) || (last && span.start < last.end) || accepted.length >= 4) return accepted;
                seenRoles.add(span.role);
                accepted.push(span);
                return accepted;
            }, []);
    }

    function normalizeSpan(span, text) {
        const role = normalizeRole(span && span.role);
        const exactText = String(span && span.text || '').trim();
        let start = Number(span && span.start);
        let end = Number(span && span.end);
        const offsetsValid = Number.isInteger(start)
            && Number.isInteger(end)
            && start >= 0
            && end > start
            && end <= text.length;
        if (exactText && (!offsetsValid || text.slice(start, end) !== exactText)) {
            start = text.indexOf(exactText);
            end = start >= 0 ? start + exactText.length : -1;
        }
        return { start, end, role };
    }

    function deriveStructurePattern(spans) {
        const roles = new Set(spans.map((span) => span.role));
        if (roles.has('object') && roles.has('complement')) return 'SVOC';
        if (roles.has('object')) return 'SVO';
        if (roles.has('complement')) return 'SVC';
        return roles.has('subject') && roles.has('predicate') ? 'SV' : '未完整识别';
    }

    function normalizeRole(role) {
        const value = String(role || '').toLowerCase().trim();
        if (value === 'verb' || value === 'predicate verb') return 'predicate';
        return value;
    }

    function renderSentenceDetail(item, result) {
        const phraseHtml = result.phrases.length
            ? result.phrases.map((phrase) => `
                <span class="rer-phrase-row">
                    <span class="rer-phrase-text">${escapeHtml(phrase.text)}</span>
                    <span class="rer-phrase-meaning">${escapeHtml(phrase.meaning)}</span>
                </span>
            `).join('')
            : '<span class="rer-help">无额外重点词组</span>';
        const structureHtml = result.spans.length
            ? result.spans.map((span) => `
                <span class="rer-structure-row">
                    <span class="rer-role-label" data-role="${escapeHtml(span.role)}">${escapeHtml(ROLE_LABEL[span.role] || span.role)}</span>
                    <span>${escapeHtml(item.text.slice(span.start, span.end))}</span>
                </span>
            `).join('')
            : '<span class="rer-help">未识别到明确主干</span>';
        item.detailNode.innerHTML = `
            <span class="rer-detail-section">
                <span class="rer-detail-heading">译文</span>
                <span class="rer-detail-content">${escapeHtml(result.translation)}</span>
            </span>
            <span class="rer-detail-section">
                <span class="rer-detail-heading">重点词组</span>
                <span class="rer-detail-content rer-phrase-list">${phraseHtml}</span>
            </span>
            <span class="rer-detail-section">
                <span class="rer-detail-heading">句子主干</span>
                <span class="rer-detail-content rer-structure-list">
                    <span class="rer-pattern-row"><span class="rer-role-label">句型</span><span class="rer-pattern">${escapeHtml(result.pattern)}</span></span>
                    ${structureHtml}
                </span>
            </span>
        `;
    }

    function setDetailMessage(item, message) {
        if (item.ready) return;
        item.detailNode.innerHTML = `<span class="rer-help">${escapeHtml(message)}</span>`;
    }

    function renderUnloadedDetail(item, message = '本句尚未精读') {
        if (item.ready) return;
        item.detailNode.innerHTML = `
            <span class="rer-detail-empty">
                <span class="rer-detail-empty-copy">${escapeHtml(message)}</span>
                <span class="rer-detail-actions">
                    <button type="button" class="rer-button rer-button-primary" data-rer-sentence-action="load-one" data-rer-sentence-id="${escapeHtml(item.id)}">精读本句</button>
                </span>
            </span>
        `;
    }

    async function requestChat(payload, options = {}) {
        const maxAttempts = Number.isInteger(options.maxAttempts)
            ? Math.max(1, options.maxAttempts)
            : REQUEST_MAX_ATTEMPTS;
        let lastError = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                return await requestChatOnce(payload);
            } catch (error) {
                lastError = error;
                const splitNow = options.splitOnTimeout && error.code === 'timeout';
                if (!error.retryable || splitNow || attempt >= maxAttempts) throw error;
                await delay(REQUEST_RETRY_DELAY_MS * attempt);
            }
        }
        throw lastError || new Error('API 请求失败。');
    }

    function requestChatOnce({ system, user }) {
        const url = getChatCompletionsUrl();
        if (!url) return Promise.reject(new Error('API 地址为空。'));
        const body = {
            model: config.model,
            reasoning_effort: REASONING_EFFORT,
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
                timeout: REQUEST_TIMEOUT_MS,
                onload: (response) => {
                    if (response.status < 200 || response.status >= 300) {
                        reject(createRequestError(
                            `API 请求失败 HTTP ${response.status}: ${String(response.responseText || '').slice(0, 180)}`,
                            response.status === 408 || response.status === 429 || response.status >= 500,
                            `http-${response.status}`
                        ));
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
                onerror: () => reject(createRequestError('API 网络请求失败。', true, 'network')),
                ontimeout: () => reject(createRequestError(`API 请求超过 ${REQUEST_TIMEOUT_MS / 1000} 秒。`, true, 'timeout'))
            });
        });
    }

    function createRequestError(message, retryable, code) {
        const error = new Error(message);
        error.retryable = Boolean(retryable);
        error.code = code || 'request';
        return error;
    }

    function delay(milliseconds) {
        return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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
