// ==UserScript==
// @name         Reuters English Reader
// @name:zh-CN   Reuters 英文精读助手
// @name:en      Reuters English Reader
// @namespace    https://scripts.fulafu.com/
// @version      0.3.0
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

    const SCRIPT_VERSION = '0.3.0';
    const SCRIPT_RELEASED_AT = '2026-08-18 14:40:21 UTC+8';
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
    const sentences = new Map();

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

        html.rer-reading-active [data-rer-reading-element="true"] {
            line-height: 1.72 !important;
        }

        .rer-reading-title .rer-sentence-block {
            margin: 0.24em 0 0.42em;
        }

        .rer-reading-title .rer-sentence {
            padding: 0.28em 0.4em 0.32em;
            line-height: 1.28;
        }

        .rer-reading-title .rer-detail-panel {
            font-weight: 400;
        }

        .rer-sentence-block {
            display: block;
            box-sizing: border-box;
            margin: 0.62em 0 0.78em;
            color: inherit;
        }

        .rer-sentence {
            display: block;
            box-sizing: border-box;
            padding: 0.48em 0.62em 0.52em;
            border-left: 3px solid rgba(8, 121, 111, 0.5);
            border-bottom: 1px solid var(--rer-line);
            border-radius: 6px 6px 3px 3px;
            background: rgba(249, 251, 250, 0.92);
            color: inherit;
            letter-spacing: 0 !important;
            transition: border-color 140ms ease, background-color 140ms ease;
        }

        .rer-sentence-block:nth-child(2n) .rer-sentence {
            border-left-color: rgba(164, 75, 39, 0.48);
            background: rgba(252, 250, 247, 0.9);
        }

        .rer-sentence.rer-analyzed {
            border-left-color: rgba(8, 121, 111, 0.9);
        }

        .rer-structure {
            border-radius: 3px;
            padding: 0.01em 0.04em 0.03em;
            text-decoration-line: underline;
            text-decoration-thickness: 2px;
            text-underline-offset: 0.2em;
            box-decoration-break: clone;
            -webkit-box-decoration-break: clone;
        }

        .rer-role-subject {
            background: rgba(22, 119, 255, 0.1);
            text-decoration-color: #1677ff;
        }

        .rer-role-predicate {
            background: rgba(205, 55, 75, 0.1);
            text-decoration-color: #cd374b;
        }

        .rer-role-object {
            background: rgba(21, 128, 61, 0.1);
            text-decoration-color: #15803d;
        }

        .rer-role-complement {
            background: rgba(116, 76, 184, 0.1);
            text-decoration-color: #744cb8;
        }

        .rer-detail-toggle {
            display: flex;
            box-sizing: border-box;
            align-items: center;
            width: 100%;
            min-height: 32px;
            gap: 9px;
            margin: 0;
            padding: 0 0.4em 0 0.62em;
            border: 0;
            border-radius: 0 0 6px 6px;
            background: transparent;
            color: var(--rer-muted);
            cursor: pointer;
            font: 600 11px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            letter-spacing: 0;
            text-align: left;
            touch-action: manipulation;
        }

        .rer-detail-toggle:hover,
        .rer-detail-toggle:focus-visible {
            background: rgba(8, 121, 111, 0.06);
            color: var(--rer-accent-strong);
            outline: none;
        }

        .rer-detail-rule {
            height: 1px;
            flex: 1;
            background: var(--rer-line);
        }

        .rer-detail-toggle-label {
            flex: 0 0 auto;
            white-space: nowrap;
        }

        .rer-detail-chevron {
            width: 7px;
            height: 7px;
            flex: 0 0 auto;
            border-right: 1.5px solid currentColor;
            border-bottom: 1.5px solid currentColor;
            transform: rotate(45deg) translateY(-2px);
            transition: transform 140ms ease;
        }

        .rer-detail-toggle[aria-expanded="true"] .rer-detail-chevron {
            transform: rotate(225deg) translate(-1px, -1px);
        }

        .rer-detail-toggle.rer-detail-ready {
            color: var(--rer-accent);
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
            if (button.getAttribute('data-rer-settings') === 'cancel') {
                closeSettings();
                return;
            }
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
        for (const { element, isHeadline } of readingElements) {
            if (element.dataset.rerReadingElement === 'true') continue;
            const text = normalizeReadingText(element.textContent);
            if (!shouldProcessReadingElement(text, element, isHeadline)) continue;
            const parts = isHeadline ? [text] : segmentSentences(text);
            if (!parts.length) continue;
            element.textContent = '';
            element.dataset.rerReadingElement = 'true';
            if (isHeadline) {
                element.classList.add('rer-reading-title');
            } else {
                element.dataset.rerParagraph = 'true';
            }
            for (const sentenceText of parts) {
                const id = `${SENTENCE_PREFIX}-${++sentenceCounter}`;
                const block = document.createElement('span');
                block.className = 'rer-sentence-block';
                const sentenceNode = document.createElement('span');
                sentenceNode.className = 'rer-sentence';
                sentenceNode.dataset.rerSentenceId = id;
                sentenceNode.textContent = sentenceText;
                const toggleNode = document.createElement('button');
                toggleNode.type = 'button';
                toggleNode.className = 'rer-detail-toggle';
                toggleNode.dataset.rerSentenceToggle = id;
                toggleNode.setAttribute('aria-expanded', String(Boolean(config.defaultExpanded)));
                toggleNode.innerHTML = `
                    <span class="rer-detail-rule"></span>
                    <span class="rer-detail-toggle-label">精读尚未加载</span>
                    <span class="rer-detail-chevron" aria-hidden="true"></span>
                `;
                const detailNode = document.createElement('span');
                detailNode.className = 'rer-detail-panel';
                detailNode.dataset.rerSentenceDetail = id;
                detailNode.hidden = !config.defaultExpanded;
                detailNode.innerHTML = '<span class="rer-help">本句精读尚未加载。</span>';
                block.append(sentenceNode, toggleNode, detailNode);
                element.append(block);
                const item = {
                    id,
                    text: sentenceText,
                    order: sentenceCounter,
                    node: sentenceNode,
                    toggleNode,
                    detailNode,
                    ready: false,
                    loading: false
                };
                sentences.set(id, item);
                restoreCachedAnalysis(item);
            }
            changed += 1;
        }
        if (changed > 0) {
            updateLoadedCount();
            if (config.autoAnalyze && getConfigReady()) queueAutoAnalyze();
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
        if (headline) elements.push({ element: headline, isHeadline: true });
        for (const paragraph of collectParagraphs(root)) {
            if (paragraph !== headline) elements.push({ element: paragraph, isHeadline: false });
        }
        return elements;
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
            .filter((item) => item.node.isConnected)
            .sort((left, right) => {
                if (left.node === right.node) return 0;
                const position = left.node.compareDocumentPosition(right.node);
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
            const toggle = event.target.closest('[data-rer-sentence-toggle]');
            if (!toggle) return;
            const item = sentences.get(toggle.dataset.rerSentenceToggle);
            if (!item) return;
            setDetailExpanded(item, toggle.getAttribute('aria-expanded') !== 'true');
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeSettings();
        });
    }

    function setDetailExpanded(item, expanded) {
        item.toggleNode.setAttribute('aria-expanded', String(expanded));
        item.detailNode.hidden = !expanded;
        updateDetailToggleLabel(item);
    }

    function updateDetailToggleLabel(item) {
        const label = item.toggleNode.querySelector('.rer-detail-toggle-label');
        const expanded = item.toggleNode.getAttribute('aria-expanded') === 'true';
        if (item.ready) {
            label.textContent = expanded ? '收起本句精读' : '展开本句精读';
        } else if (item.loading) {
            label.textContent = '精读加载中';
        } else {
            label.textContent = '精读尚未加载';
        }
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

    function ensureReady() {
        if (getConfigReady()) return true;
        showSettings();
        return false;
    }

    async function analyzeSentences(options = {}) {
        if (analyzeRunning || !config.enabled) return;
        if (!ensureReady()) return;
        enhanceArticle();
        const ordered = getConnectedReadingItems();
        const candidates = options.automatic
            ? ordered.slice(0, config.sentencesPerLoad)
            : ordered.filter((item) => !item.ready).slice(0, config.sentencesPerLoad);
        const pending = candidates.filter((item) => !item.ready && !item.loading);
        if (!pending.length) {
            updateLoadedCount();
            return;
        }
        analyzeRunning = true;
        setContinueButtonState(true);
        for (const item of pending) {
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
                    const appliedIds = new Set();
                    for (const result of results) {
                        if (!result || !result.id) continue;
                        if (applyAnalysisResult(result, true)) appliedIds.add(result.id);
                    }
                    for (const item of batch) {
                        if (!appliedIds.has(item.id)) failures.add(item);
                    }
                    saveAnalysisCache();
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
            saveAnalysisCache();
            if (failures.size) console.info(`[Reuters English Reader] ${failures.size} sentence(s) remain unloaded.`);
        } finally {
            for (const item of pending) {
                item.loading = false;
                if (!item.ready) setDetailMessage(item, '本句精读暂未加载。');
                updateDetailToggleLabel(item);
            }
            analyzeRunning = false;
            setContinueButtonState(false);
            updateLoadedCount();
        }
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
            || !item.node
            || !item.node.isConnected
            || !item.toggleNode.isConnected
            || !item.detailNode.isConnected) return false;
        const translation = normalizeReadingText(result.translation || result.text || '');
        if (!translation) return false;
        const phrases = sanitizePhrases(result.phrases);
        const spans = sanitizeSpans(result.spans, item.text);
        const pattern = deriveStructurePattern(spans);
        const normalized = { translation, phrases, pattern, spans };
        try {
            renderSentenceWithSpans(item.node, item.text, spans);
            renderSentenceDetail(item, normalized);
        } catch (error) {
            console.warn('[Reuters English Reader] Failed to render sentence analysis', error);
            return false;
        }
        if (item.node.textContent !== item.text || !item.detailNode.textContent.includes(translation)) return false;
        item.ready = true;
        item.loading = false;
        item.node.classList.add('rer-analyzed');
        item.toggleNode.classList.add('rer-detail-ready');
        updateDetailToggleLabel(item);
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

    function renderSentenceWithSpans(node, text, spans) {
        node.textContent = '';
        let cursor = 0;
        for (const span of spans) {
            if (span.start > cursor) node.append(document.createTextNode(text.slice(cursor, span.start)));
            const mark = document.createElement('span');
            mark.className = `rer-structure ${ROLE_CLASS[span.role]}`;
            mark.title = ROLE_LABEL[span.role] || span.role;
            mark.textContent = text.slice(span.start, span.end);
            node.append(mark);
            cursor = span.end;
        }
        if (cursor < text.length) node.append(document.createTextNode(text.slice(cursor)));
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
