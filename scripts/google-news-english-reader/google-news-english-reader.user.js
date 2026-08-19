// ==UserScript==
// @name         Google News Navigator
// @name:zh-CN   Google News 导航
// @name:en      Google News Navigator
// @namespace    https://scripts.fulafu.com/
// @version      1.0.0
// @description  One English reading companion for Google News, Reuters, and ten major publishers, with cached translations, key phrases, and core grammar highlighting.
// @description:zh-CN 统一支持 Google News、Reuters 和十大英文新闻网站，提供缓存译文、重点词组与精简句子主干标记。
// @description:en One English reading companion for Google News, Reuters, and ten major publishers, with cached translations, key phrases, and core grammar highlighting.
// @author       ZhangNingYA
// @homepageURL  https://scripts.fulafu.com/scripts/google-news-english-reader/
// @supportURL   https://github.com/ZhangNingYA/userscripts/issues
// @updateURL    https://scripts.fulafu.com/scripts/google-news-english-reader/google-news-english-reader.user.js
// @downloadURL  https://scripts.fulafu.com/scripts/google-news-english-reader/google-news-english-reader.user.js
// @match        https://news.google.com/*
// @match        https://www.reuters.com/*
// @match        https://reuters.com/*
// @match        https://apnews.com/*
// @match        https://www.bbc.com/*
// @match        https://bbc.com/*
// @match        https://www.bbc.co.uk/*
// @match        https://bbc.co.uk/*
// @match        https://www.cnn.com/*
// @match        https://cnn.com/*
// @match        https://edition.cnn.com/*
// @match        https://www.theguardian.com/*
// @match        https://www.nytimes.com/*
// @match        https://www.washingtonpost.com/*
// @match        https://www.cnbc.com/*
// @match        https://www.nbcnews.com/*
// @match        https://www.cbsnews.com/*
// @match        https://www.foxnews.com/*
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

    const SCRIPT_VERSION = '1.0.0';
    const SCRIPT_RELEASED_AT = '2026-08-19 09:28:28 UTC+8';
    const ACTIVE_MARKER = 'googleNewsNavigatorActive';
    const CONFIG_KEY = 'google-news-english-reader-config-v1';
    const LEGACY_CONFIG_KEY = 'google-news-english-reader-config-legacy';
    const ANALYSIS_CACHE_KEY = 'google-news-english-reader-analysis-v1';
    const SENTENCE_PREFIX = 'gner-s';
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
    const SITE_ADAPTERS = [
        {
            id: 'reuters',
            name: 'Reuters',
            hosts: ['reuters.com'],
            pathPattern: /^\/(world|business|markets|technology|legal|sustainability|sports|lifestyle|breakingviews|graphics)\//,
            rootSelectors: ['article[data-testid*="article" i]', 'article', 'main [data-testid*="ArticleBody" i]', 'main [data-testid*="article-body" i]']
        },
        {
            id: 'ap',
            name: 'AP News',
            hosts: ['apnews.com'],
            pathPattern: /^\/article\//,
            rootSelectors: ['[class*="RichTextStoryBody"]', '[class*="Page-storyBody"]', '[data-key="article"]']
        },
        {
            id: 'bbc',
            name: 'BBC News',
            hosts: ['bbc.com', 'bbc.co.uk'],
            pathPattern: /^\/news\/(articles\/|[^/]+-\d+)/,
            rootSelectors: ['main article', 'article']
        },
        {
            id: 'cnn',
            name: 'CNN',
            hosts: ['cnn.com'],
            pathPattern: /^\/\d{4}\/\d{2}\/\d{2}\//,
            rootSelectors: ['.article__content', '[data-component-name="article"]', 'article']
        },
        {
            id: 'guardian',
            name: 'The Guardian',
            hosts: ['theguardian.com'],
            pathPattern: /^\/[^/]+\/\d{4}\/[a-z]{3}\/[0-3]?\d\//i,
            rootSelectors: ['#article article', 'main article', 'article']
        },
        {
            id: 'nyt',
            name: 'The New York Times',
            hosts: ['nytimes.com'],
            pathPattern: /^\/\d{4}\/\d{2}\/\d{2}\//,
            rootSelectors: ['section[name="articleBody"]', 'article#story', 'main article', 'article']
        },
        {
            id: 'wapo',
            name: 'The Washington Post',
            hosts: ['washingtonpost.com'],
            pathPattern: /^\/[^/]+\/\d{4}\/\d{2}\/\d{2}\//,
            rootSelectors: ['[data-qa="article-body"]', '[data-qa="article"]', 'main article', 'article']
        },
        {
            id: 'cnbc',
            name: 'CNBC',
            hosts: ['cnbc.com'],
            pathPattern: /^\/\d{4}\/\d{2}\/\d{2}\//,
            rootSelectors: ['.ArticleBody-articleBody', '[id*="ArticleBody"]', 'main article', 'article']
        },
        {
            id: 'nbc',
            name: 'NBC News',
            hosts: ['nbcnews.com'],
            pathPattern: /-rcna\d+\/?$/,
            rootSelectors: ['.article-body__content', '.article-body', 'main article', 'article']
        },
        {
            id: 'cbs',
            name: 'CBS News',
            hosts: ['cbsnews.com'],
            pathPattern: /^\/news\/[^/]+\/?$/,
            rootSelectors: ['#article-0', '.content__body', 'article.content-article', 'article']
        },
        {
            id: 'fox',
            name: 'Fox News',
            hosts: ['foxnews.com'],
            pathPattern: /^\/(politics|us|world|media|tech|health|science|sports|entertainment|lifestyle|travel|food-drink|auto)\/[^/]+\/?$/,
            rootSelectors: ['.article-body', 'main article', 'article']
        }
    ];
    const REJECTED_CONTENT_SELECTOR = [
        '.rer-toolbar', '.rer-settings', 'nav', 'footer', 'aside', 'form', 'button',
        'figure', 'figcaption', '[role="navigation"]', '[aria-hidden="true"]',
        '[class*="caption" i]', '[class*="copyright" i]', '[class*="footer" i]',
        '[class*="legal" i]', '[class*="newsletter" i]', '[class*="promo" i]',
        '[class*="recommend" i]', '[class*="related" i]', '[class*="share" i]',
        '[class*="subscribe" i]', '[class*="timestamp" i]', '[class*="byline" i]',
        '[class*="author" i]', '[class*="metadata" i]'
    ].join(',');
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

    document.documentElement.dataset[ACTIVE_MARKER] = SCRIPT_VERSION;

    let config = loadConfig();
    let analysisCache = loadAnalysisCache();
    let sentenceCounter = 0;
    let stylesInstalled = false;
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
            --rer-ink: #172631;
            --rer-muted: #74818a;
            --rer-subtle: #a5afb4;
            --rer-line: rgba(23, 38, 49, 0.12);
            --rer-accent: #087f70;
            --rer-accent-strong: #056559;
            --rer-warm: #b45e36;
            --rer-panel: #fbfcfb;
            --rer-soft: #f2f7f5;
            --rer-shadow: 0 22px 58px rgba(18, 32, 42, 0.2), 0 3px 12px rgba(18, 32, 42, 0.08);
            --rer-ui-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
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
            z-index: 10;
            display: inline-grid;
            box-sizing: border-box;
            place-items: center;
            width: 21px;
            height: 20px;
            margin: 0 0.18em;
            padding: 0;
            border: 0;
            border-radius: 6px;
            background: #eef5f3;
            color: #5e807a;
            cursor: pointer;
            box-shadow: none;
            letter-spacing: 0;
            text-decoration: none;
            touch-action: manipulation;
            user-select: none;
            vertical-align: 0.1em;
            transition: color 140ms ease, border-color 140ms ease, background-color 140ms ease, transform 140ms ease, box-shadow 140ms ease;
        }

        .rer-detail-toggle:hover,
        .rer-detail-toggle:focus-visible {
            background: #e2f1ed;
            color: var(--rer-accent-strong);
            transform: translateY(-1px);
            box-shadow: 0 2px 6px rgba(8, 127, 112, 0.14);
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
            background: #dff1ec;
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
            position: relative;
            z-index: 10;
            display: block;
            box-sizing: border-box;
            margin: 0.22em 0 0.54em;
            padding: 0.35em 0.8em 0.76em;
            border: 1px solid rgba(8, 127, 112, 0.16);
            border-left: 3px solid rgba(8, 127, 112, 0.62);
            border-radius: 0 8px 8px 0;
            background: #f5faf8;
            color: var(--rer-ink);
            font: 13px/1.58 var(--rer-ui-font);
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
            gap: 12px;
            padding: 0.58em 0;
            border-bottom: 1px solid rgba(23, 38, 49, 0.09);
        }

        .rer-detail-section:last-child {
            border-bottom: 0;
            padding-bottom: 0.2em;
        }

        .rer-detail-heading {
            color: var(--rer-muted);
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.08em;
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
            font-weight: 750;
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
            min-height: 23px;
            padding: 0 8px;
            border: 1px solid rgba(8, 127, 112, 0.22);
            border-radius: 6px;
            background: #e5f3ef;
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
            font-family: var(--rer-ui-font);
            letter-spacing: 0;
            z-index: 2147483646;
        }

        .rer-toolbar {
            position: fixed;
            top: 68px;
            right: 20px;
            display: flex;
            align-items: center;
            width: auto;
            max-width: calc(100vw - 24px);
            min-height: 46px;
            gap: 7px;
            padding: 6px 7px 6px 10px;
            border: 1px solid rgba(23, 38, 49, 0.12);
            border-radius: 14px;
            background: rgba(251, 252, 251, 0.96);
            box-shadow: var(--rer-shadow);
            backdrop-filter: blur(12px);
            overflow: hidden;
        }

        .rer-status {
            min-width: 34px;
            padding: 0 4px;
            color: var(--rer-ink);
            font-size: 12px;
            font-weight: 800;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
        }

        .rer-status::before {
            content: "";
            display: inline-block;
            width: 6px;
            height: 6px;
            margin: 0 6px 1px 0;
            border-radius: 50%;
            background: #23a77e;
            box-shadow: 0 0 0 3px rgba(35, 167, 126, 0.12);
            vertical-align: middle;
        }

        .rer-toolbar-actions {
            display: flex;
            flex: 0 0 auto;
            gap: 4px;
        }

        .rer-button {
            appearance: none;
            min-width: 0;
            min-height: 35px;
            padding: 0 11px;
            border: 1px solid rgba(23, 38, 49, 0.13);
            border-radius: 8px;
            background: #f4f8f7;
            color: var(--rer-accent-strong);
            cursor: pointer;
            font: 700 12px/1 var(--rer-ui-font);
            letter-spacing: 0;
            white-space: nowrap;
            touch-action: manipulation;
        }

        .rer-button:hover,
        .rer-button:focus-visible {
            background: #e4f2ee;
            border-color: rgba(8, 127, 112, 0.35);
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
            box-shadow: 0 4px 10px rgba(8, 127, 112, 0.2);
        }

        .rer-button-primary:hover,
        .rer-button-primary:focus-visible {
            background: var(--rer-accent-strong);
        }

        .rer-button-danger {
            border-color: rgba(190, 48, 57, 0.22);
            background: #fff8f7;
            color: #ad3d46;
        }

        .rer-button-danger:hover,
        .rer-button-danger:focus-visible {
            border-color: rgba(190, 48, 57, 0.6);
            background: #ffeded;
        }

        .rer-toolbar .rer-button {
            min-height: 34px;
            padding: 0 9px;
        }

        .rer-toolbar .rer-icon-button {
            display: inline-grid;
            place-items: center;
            width: 34px;
            padding: 0;
            border-radius: 9px;
        }

        .rer-toolbar-icon {
            width: 16px;
            height: 16px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
            pointer-events: none;
        }

        .rer-settings-backdrop {
            position: fixed;
            inset: 0;
            z-index: 2147483645;
            background: rgba(17, 29, 37, 0.3);
            backdrop-filter: blur(2px);
        }

        .rer-settings {
            position: fixed;
            top: 68px;
            right: 20px;
            width: min(370px, calc(100vw - 32px));
            max-height: calc(100vh - 84px);
            overflow: auto;
            padding: 0;
            border: 1px solid rgba(23, 38, 49, 0.13);
            border-radius: 14px;
            background: var(--rer-panel);
            box-shadow: var(--rer-shadow);
        }

        .rer-settings-header {
            display: flex;
            align-items: center;
            gap: 11px;
            padding: 16px 17px 14px;
            border-bottom: 1px solid var(--rer-line);
            background: #f3f8f6;
        }

        .rer-settings-mark {
            display: grid;
            place-items: center;
            width: 30px;
            height: 30px;
            flex: 0 0 auto;
            border-radius: 9px;
            background: var(--rer-accent);
            color: #ffffff;
            font-size: 13px;
            font-weight: 850;
            letter-spacing: -0.02em;
            box-shadow: 0 5px 12px rgba(8, 127, 112, 0.2);
        }

        .rer-settings-title {
            min-width: 0;
            flex: 1;
        }

        .rer-settings-eyebrow {
            margin: 0 0 2px;
            color: var(--rer-accent-strong);
            font-size: 9px;
            font-weight: 850;
            letter-spacing: 0.12em;
            line-height: 1.2;
            text-transform: uppercase;
        }

        .rer-settings-header h2 {
            flex: 1;
            margin: 0;
            color: var(--rer-ink);
            font-size: 17px;
            font-weight: 800;
            line-height: 1.25;
        }

        .rer-settings-close {
            appearance: none;
            width: 30px;
            height: 30px;
            border: 1px solid transparent;
            border-radius: 8px;
            background: rgba(23, 38, 49, 0.05);
            color: var(--rer-muted);
            cursor: pointer;
            font-size: 21px;
            line-height: 1;
        }

        .rer-settings-close:hover,
        .rer-settings-close:focus-visible {
            border-color: rgba(23, 38, 49, 0.12);
            background: rgba(23, 38, 49, 0.09);
            outline: none;
        }

        .rer-settings-body {
            padding: 15px 17px 10px;
        }

        .rer-settings-command-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            gap: 9px;
            padding: 0 0 14px;
            border-bottom: 1px solid var(--rer-line);
        }

        .rer-load-all-button {
            min-height: 39px;
        }

        .rer-batch-control {
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--rer-muted);
            font-size: 10px;
            font-weight: 700;
            white-space: nowrap;
        }

        .rer-api-fields {
            display: grid;
            gap: 9px;
            padding: 14px 0;
        }

        .rer-api-row {
            display: grid;
            grid-template-columns: 34px minmax(0, 1fr);
            align-items: center;
            gap: 9px;
            color: #607078;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.08em;
        }

        .rer-api-row input {
            box-sizing: border-box;
            width: 100%;
            min-width: 0;
            min-height: 39px;
            padding: 8px 11px;
            border: 1px solid rgba(23, 38, 49, 0.16);
            border-radius: 9px;
            background: #ffffff;
            color: var(--rer-ink);
            font: 13px/1.3 var(--rer-ui-font);
            letter-spacing: 0;
        }

        .rer-api-row input:focus {
            border-color: rgba(8, 127, 112, 0.7);
            outline: 3px solid rgba(8, 127, 112, 0.12);
        }

        .rer-help {
            color: var(--rer-muted);
            font-size: 11px;
            line-height: 1.45;
        }

        .rer-cache-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            min-height: 39px;
            padding-top: 10px;
            border-top: 1px solid var(--rer-line);
            color: var(--rer-muted);
            font-size: 11px;
            font-weight: 700;
        }

        .rer-setting-number {
            box-sizing: border-box;
            width: 62px;
            min-height: 35px;
            padding: 5px 8px;
            border: 1px solid rgba(23, 38, 49, 0.16);
            border-radius: 8px;
            background: #ffffff;
            color: var(--rer-ink);
            font: 13px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            text-align: center;
        }

        .rer-setting-number:focus {
            border-color: rgba(8, 127, 112, 0.7);
            outline: 3px solid rgba(8, 127, 112, 0.12);
        }

        .rer-settings-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 17px 14px;
            border-top: 1px solid var(--rer-line);
            background: #f7faf9;
        }

        .rer-settings-version {
            color: var(--rer-muted);
            font-size: 10px;
            font-variant-numeric: tabular-nums;
        }

        @media (max-width: 560px) {
            .rer-toolbar {
                top: 58px;
                right: 12px;
                width: auto;
            }

            .rer-settings {
                top: 58px;
                right: 10px;
                width: calc(100vw - 20px);
                max-height: calc(100vh - 68px);
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

        }
    `;

    function init() {
        installStyles();
        registerMenu();
        if (!config.enabled) return;
        document.documentElement.classList.add('rer-reading-active');
        buildToolbar();
        installInteractionHandlers();
        enhanceArticle();
        observePageChanges();
        updateLoadedCount();
    }

    function installStyles() {
        if (stylesInstalled) return;
        try {
            if (typeof GM_addStyle === 'function') {
                GM_addStyle(css);
                stylesInstalled = true;
                return;
            }
        } catch (error) {
            console.warn('[Google News Navigator] Failed to inject styles through the userscript manager', error);
        }
        const style = document.createElement('style');
        style.dataset.gnerStyles = 'true';
        style.textContent = css;
        (document.head || document.documentElement).append(style);
        stylesInstalled = true;
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
        normalized.model = DEFAULT_MODEL;
        normalized.enabled = true;
        normalized.autoAnalyze = true;
        normalized.sentencesPerLoad = Math.min(10, Math.max(1, Math.round(Number(normalized.sentencesPerLoad) || 5)));
        normalized.defaultExpanded = false;
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
            console.warn('[Google News Navigator] Failed to read storage', error);
            return fallback;
        }
    }

    function safeSetValue(key, value) {
        try {
            GM_setValue(key, value);
        } catch (error) {
            console.warn('[Google News Navigator] Failed to save storage', error);
        }
    }

    function getConfigReady() {
        return Boolean(config.endpoint && config.apiKey && config.model);
    }

    function buildToolbar() {
        if (!toolbarRoot) {
            toolbarRoot = document.createElement('section');
            toolbarRoot.className = 'rer-toolbar';
            toolbarRoot.setAttribute('aria-label', 'Google News Navigator');
            toolbarRoot.innerHTML = `
                <span class="rer-status" data-rer-status aria-live="polite">0</span>
                <div class="rer-toolbar-actions">
                    <button type="button" class="rer-button rer-button-primary rer-icon-button" data-rer-action="continue" aria-label="继续加载" title="继续加载">
                        <svg class="rer-toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="m7 6 5 5 5-5"></path>
                            <path d="m7 13 5 5 5-5"></path>
                        </svg>
                    </button>
                    <button type="button" class="rer-button rer-icon-button" data-rer-action="settings" aria-label="设置" title="设置">
                        <svg class="rer-toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M21 4h-7"></path>
                            <path d="M10 4H3"></path>
                            <path d="M21 12h-9"></path>
                            <path d="M8 12H3"></path>
                            <path d="M21 20h-5"></path>
                            <path d="M12 20H3"></path>
                            <path d="M14 2v4"></path>
                            <path d="M8 10v4"></path>
                            <path d="M16 18v4"></path>
                        </svg>
                    </button>
                </div>
            `;
            statusNode = toolbarRoot.querySelector('[data-rer-status]');
            toolbarRoot.addEventListener('click', handleToolbarClick);
        }
        if (!toolbarRoot.isConnected) document.documentElement.append(toolbarRoot);
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
        if (statusNode) statusNode.textContent = String(ready);
    }

    function registerMenu() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        GM_registerMenuCommand('Google News Navigator: 设置', showSettings);
        GM_registerMenuCommand('Google News Navigator: 继续精读', () => analyzeSentences());
    }

    function showSettings() {
        closeSettings();
        const backdrop = document.createElement('div');
        backdrop.className = 'rer-settings-backdrop';
        const panel = document.createElement('section');
        panel.className = 'rer-settings';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', 'Google News Navigator settings');
        panel.innerHTML = `
            <div class="rer-settings-header">
                <span class="rer-settings-mark" aria-hidden="true">G</span>
                <div class="rer-settings-title">
                    <p class="rer-settings-eyebrow">GOOGLE NEWS NAVIGATOR</p>
                    <h2>Reading settings</h2>
                </div>
                <button type="button" class="rer-settings-close" data-rer-settings="cancel" aria-label="关闭" title="关闭">&times;</button>
            </div>
            <div class="rer-settings-body">
                <div class="rer-settings-command-row">
                    <button type="button" class="rer-button rer-button-primary rer-load-all-button" data-rer-settings="load-all">Analyze page</button>
                    <label class="rer-batch-control" for="rer-sentences-per-load">
                        <span>Batch</span>
                        <input class="rer-setting-number" id="rer-sentences-per-load" type="number" min="1" max="10" step="1" inputmode="numeric">
                    </label>
                </div>
                <div class="rer-api-fields">
                    <label class="rer-api-row" for="rer-endpoint">
                        <span>URL</span>
                        <input id="rer-endpoint" type="text" autocomplete="off" spellcheck="false" placeholder="https://example.com/v1">
                    </label>
                    <label class="rer-api-row" for="rer-key">
                        <span>KEY</span>
                        <input id="rer-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-...">
                    </label>
                </div>
                <div class="rer-cache-row">
                    <span>Cache</span>
                    <button type="button" class="rer-button rer-button-danger" data-rer-settings="clear-cache">Clear</button>
                </div>
            </div>
            <div class="rer-settings-footer">
                <div class="rer-settings-version">v${escapeHtml(SCRIPT_VERSION)}</div>
                <button type="button" class="rer-button rer-button-primary" data-rer-settings="save">Save</button>
            </div>
        `;
        settingsRoot = document.createElement('div');
        settingsRoot.append(backdrop, panel);
        document.documentElement.append(settingsRoot);

        const endpointInput = panel.querySelector('#rer-endpoint');
        const keyInput = panel.querySelector('#rer-key');
        const sentencesPerLoadInput = panel.querySelector('#rer-sentences-per-load');
        endpointInput.value = config.endpoint || '';
        keyInput.value = config.apiKey || '';
        sentencesPerLoadInput.value = String(config.sentencesPerLoad);

        const persistSettings = () => saveConfig({
            endpoint: cleanEndpoint(endpointInput.value),
            apiKey: keyInput.value.trim(),
            model: DEFAULT_MODEL,
            enabled: true,
            autoAnalyze: true,
            defaultExpanded: false,
            sentencesPerLoad: sentencesPerLoadInput.value,
            targetLanguage: DEFAULT_CONFIG.targetLanguage
        });

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
            if (action !== 'save' && action !== 'load-all') return;
            persistSettings();
            closeSettings();
            buildToolbar();
            updateLoadedCount();
            if (action === 'load-all') {
                requestFullArticleAnalysis();
                return;
            }
            if (config.enabled && config.autoAnalyze && getConfigReady()) queueAutoAnalyze();
        });
        endpointInput.focus();
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
        for (const { element, isHeadline, isLinkedTitle, kind } of readingElements) {
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
                toggleNode.setAttribute('aria-label', kind === 'headline' ? '查看本标题精读' : '查看本句精读');
                toggleNode.title = kind === 'headline' ? '查看本标题精读' : '查看本句精读';
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
                    kind,
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
                insertSentenceControls(item, textMap, isTitle);
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
        if (!isGoogleNewsPage()) {
            const adapter = getSiteAdapter();
            if (!adapter || !adapter.pathPattern.test(location.pathname)) return null;
            return findBestArticleRoot(adapter.rootSelectors)
                || findBestArticleRoot(['main article', 'article', 'main']);
        }
        return findGoogleNewsRoot();
    }

    function isGoogleNewsPage() {
        return location.hostname.toLowerCase() === 'news.google.com';
    }

    function getSiteAdapter() {
        const hostname = location.hostname.toLowerCase().replace(/^www\./, '');
        return SITE_ADAPTERS.find((adapter) => adapter.hosts.some((host) => (
            hostname === host || hostname.endsWith(`.${host}`)
        ))) || null;
    }

    function findBestArticleRoot(selectors) {
        const candidates = [];
        const seen = new Set();
        for (const selector of selectors) {
            for (const node of document.querySelectorAll(selector)) {
                if (!(node instanceof HTMLElement) || seen.has(node)) continue;
                seen.add(node);
                candidates.push(node);
            }
        }
        const ranked = candidates
            .map((node) => {
                const paragraphs = Array.from(node.querySelectorAll('p')).filter(isLikelyBodyParagraph);
                const textLength = paragraphs.reduce((total, paragraph) => (
                    total + normalizeReadingText(paragraph.textContent).length
                ), 0);
                return { node, paragraphCount: paragraphs.length, score: textLength + paragraphs.length * 40 };
            })
            .filter((candidate) => candidate.paragraphCount > 0 && candidate.score >= 120)
            .sort((left, right) => right.score - left.score);
        return ranked[0] ? ranked[0].node : null;
    }

    function findGoogleNewsRoot() {
        const candidates = Array.from(document.querySelectorAll('main, [role="main"]'))
            .filter((element, index, elements) => elements.indexOf(element) === index)
            .map((element) => ({
                element,
                headlineLinks: element.querySelectorAll('a[href*="/read/"], a[href*="/articles/"]').length,
                textLength: normalizeReadingText(element.textContent).length
            }))
            .filter((candidate) => candidate.headlineLinks > 0 && candidate.textLength >= 80)
            .sort((left, right) => right.headlineLinks - left.headlineLinks || right.textLength - left.textLength);
        if (candidates[0]) return candidates[0].element;
        const body = document.body;
        if (body && body.querySelector('a[href*="/read/"], a[href*="/articles/"]')) return body;
        return null;
    }

    function collectReadingElements(root) {
        if (!isGoogleNewsPage()) return collectArticleReadingElements(root);
        return collectGoogleNewsHeadlines(root);
    }

    function collectGoogleNewsHeadlines(root) {
        const elements = [];
        const seenHeadlines = new Set();
        for (const anchor of root.querySelectorAll('a[href]')) {
            if (!(anchor instanceof HTMLAnchorElement) || !isGoogleNewsHeadline(anchor)) continue;
            const text = normalizeReadingText(anchor.textContent);
            const key = text.toLocaleLowerCase('en-US');
            if (seenHeadlines.has(key)) continue;
            seenHeadlines.add(key);
            elements.push({ element: anchor, isHeadline: false, isLinkedTitle: true, kind: 'headline' });
        }
        return elements;
    }

    function collectArticleReadingElements(root) {
        const headline = findHeadline(root);
        const elements = [];
        const seen = new Set();
        const add = (element, isHeadline = false) => {
            if (!element || seen.has(element)) return;
            seen.add(element);
            elements.push({
                element,
                isHeadline,
                isLinkedTitle: false,
                kind: isHeadline ? 'headline' : 'sentence'
            });
        };
        add(headline, true);
        for (const paragraph of collectParagraphs(root)) add(paragraph, false);
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
        const unique = [];
        const seen = new Set();
        for (const node of root.querySelectorAll('p')) {
            if (!(node instanceof HTMLElement) || seen.has(node) || !isLikelyBodyParagraph(node)) continue;
            seen.add(node);
            unique.push(node);
        }
        return unique;
    }

    function isLikelyBodyParagraph(element) {
        if (!(element instanceof HTMLElement) || element.closest(REJECTED_CONTENT_SELECTOR)) return false;
        if (element.querySelector('time, button, input, textarea, select')) return false;
        const text = normalizeReadingText(element.textContent);
        if (text.length < 45 || !/[A-Za-z]/.test(text)) return false;
        if ((text.match(/[A-Za-z]+/g) || []).length < 7) return false;
        if (/^(copyright|all rights reserved|click here|read more|sign up|subscribe|reporting by|editing by|this material may not)\b/i.test(text)) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 || rect.height > 0;
    }

    function isGoogleNewsHeadline(anchor) {
        let pathname = '';
        try {
            pathname = new URL(anchor.href, location.href).pathname;
        } catch (error) {
            return false;
        }
        if (!/^\/(?:read|articles)\//.test(pathname)) return false;
        if (anchor.closest('header, nav, aside, footer, form, [role="navigation"]')) return false;
        const text = normalizeReadingText(anchor.textContent);
        if (text.length < 18 || text.length > 320 || !/[A-Za-z]/.test(text)) return false;
        if ((text.match(/[A-Za-z]+/g) || []).length < 3) return false;
        if (/^(see more|full coverage|more headlines|read more)\b/i.test(text)) return false;
        const rect = anchor.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function shouldProcessReadingElement(text, element, isHeadline) {
        const minimumLength = isHeadline ? 12 : 45;
        if (!text || text.length < minimumLength || !/[A-Za-z]/.test(text)) return false;
        if (isGoogleNewsPage()) {
            if (element.closest('.rer-toolbar, .rer-settings, header, nav, footer, aside, form, button')) return false;
            if (element.querySelector('time, button, input, textarea, select')) return false;
        } else if (isHeadline) {
            if (element.closest('.rer-toolbar, .rer-settings, nav, footer, aside, form, button')) return false;
        } else if (!isLikelyBodyParagraph(element)) {
            return false;
        }
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
            if (!toolbarRoot || !toolbarRoot.isConnected) buildToolbar();
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
                    console.warn('[Google News Navigator] Failed to map structure highlight', error);
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
        const noun = item.kind === 'headline' ? '标题' : '句';
        let message = `查看本${noun}精读`;
        item.toggleNode.dataset.rerLoading = String(Boolean(item.loading || item.queued));
        if (item.ready) {
            message = expanded ? `收起本${noun}精读` : `查看本${noun}精读`;
        } else if (item.loading) {
            message = '精读加载中';
        } else if (item.queued) {
            message = `本${noun}等待加载`;
        } else {
            message = `本${noun}精读尚未加载`;
        }
        item.toggleNode.setAttribute('aria-label', message);
        item.toggleNode.title = message;
    }

    function queueAutoAnalyze() {
        const articleKey = getReadingPageKey();
        if (autoAnalyzedArticleKey === articleKey) return;
        window.clearTimeout(autoAnalyzeTimer);
        autoAnalyzeQueuedKey = articleKey;
        autoAnalyzeTimer = window.setTimeout(() => {
            if (autoAnalyzeQueuedKey !== articleKey
                || articleKey !== getReadingPageKey()
                || !config.enabled
                || !config.autoAnalyze
                || !getConfigReady()) return;
            autoAnalyzeQueuedKey = '';
            autoAnalyzedArticleKey = articleKey;
            analyzeSentences({ automatic: true });
        }, 700);
    }

    function getReadingPageKey() {
        const url = new URL(location.href);
        url.hash = '';
        for (const key of ['hl', 'gl', 'ceid']) url.searchParams.delete(key);
        const query = url.searchParams.toString();
        return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`;
    }

    function restoreCachedAnalysis(item) {
        const cached = analysisCache[getSentenceCacheKey(item.text)];
        if (!cached || cached.text !== item.text || !cached.translation) return false;
        return applyAnalysisResult({ ...cached, id: item.id }, false);
    }

    function getSentenceCacheKey(text) {
        const value = `v3\n${config.model}\n${config.targetLanguage}\n${text}`;
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
            structureReliable: result.structureReliable,
            savedAt: Date.now()
        };
    }

    function clearAnalysisCache() {
        analysisGeneration += 1;
        window.clearTimeout(autoAnalyzeTimer);
        autoAnalyzeQueuedKey = '';
        autoAnalyzedArticleKey = getReadingPageKey();
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
            setDetailMessage(item, item.kind === 'headline' ? '正在后台准备标题精读...' : '正在后台准备本句精读...');
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
                    console.warn('[Google News Navigator] Analysis batch failed', error);
                }
                updateLoadedCount();
            }
        };
        try {
            const workerCount = Math.min(ANALYSIS_CONCURRENCY, batches.length);
            await Promise.all(Array.from({ length: workerCount }, () => worker()));
            if (runGeneration === analysisGeneration) saveAnalysisCache();
            if (failures.size) console.info(`[Google News Navigator] ${failures.size} item(s) remain unloaded.`);
        } finally {
            for (const item of pending) {
                item.loading = false;
                if (!item.ready) {
                    renderUnloadedDetail(item, failures.has(item)
                        ? '加载失败，请重试。'
                        : (item.kind === 'headline' ? '本标题尚未精读' : '本句尚未精读'));
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
        const unit = isGoogleNewsPage() ? '条新闻标题' : '句';
        if (!remaining) {
            window.alert('当前页面已经全部加载。');
            return;
        }
        if (!window.confirm(`将分析当前页面尚未完成的 ${remaining} ${unit}，可能产生较多 API 请求。继续吗？`)) return;
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
                'You create concise Chinese reading notes for English news headlines and article sentences.',
                'Return JSON only, without markdown.',
                'For each sentence return id, translation, phrases, pattern, and spans.',
                'phrases contains 1 to 3 difficult or important phrases as {text, meaning}.',
                'pattern must be exactly one of SV, SVO, SVC, or SVOC.',
                'spans uses exact zero-based character offsets, a 1-based standalone occurrence, and only roles subject, predicate, object, complement.',
                'Identify the finite predicate of the main clause first, then select only the subject governed by that predicate and its object or complement.',
                'Do not use a subject, predicate, object, or complement from a subordinate or relative clause when marking the main clause.',
                'Every span text must be an exact whole word or phrase from the sentence; never start or end inside a larger word.',
                'occurrence counts only exact standalone matches of span text, never text embedded inside another word.',
                'Mark only the shortest main-clause core: at most one span per role and at most four spans total.',
                'For an active transitive main verb, always include its direct object and use SVO or SVOC.',
                'For a linking verb, include its subject complement and use SVC.',
                'For an intransitive or passive clause with no grammatical object, use SV and do not invent an object.',
                'Include auxiliaries in the shortest complete predicate.',
                'Never mark modifiers, connectors, or the whole sentence.'
            ].join(' '),
            user: [
                'Translate each sentence into natural Simplified Chinese, explain its key phrases, and identify only its core clause structure.',
                'Return an array like [{"id":"gner-s-1","translation":"...","phrases":[{"text":"...","meaning":"..."}],"pattern":"SVO","spans":[{"text":"Google","start":0,"end":6,"occurrence":1,"role":"subject"}]}].',
                'Keep names, numbers, organizations, and dates accurate. Offsets, standalone occurrence, and exact span text must all refer to the same phrase.',
                JSON.stringify(payload)
            ].join('\n')
        }, { splitOnTimeout: batch.length > 1 });
        const parsed = parseJsonMaybe(response);
        const sourceById = new Map(batch.map((item) => [item.id, item]));
        const parsedIds = Array.isArray(parsed) ? new Set(parsed.map((result) => result && result.id)) : new Set();
        if (!Array.isArray(parsed)
            || parsed.length !== batch.length
            || parsedIds.size !== batch.length
            || !parsed.every((result) => isAnalysisResultValid(result, sourceById.get(result && result.id)))) {
            throw createRequestError('模型没有返回可解析的精读 JSON。', false, 'invalid-analysis');
        }
        return parsed;
    }

    function isAnalysisResultValid(result, item) {
        return Boolean(result && item && normalizeReadingText(result.translation || result.text || ''));
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
        const candidateSpans = sanitizeSpans(result.spans, item.text);
        const statedPattern = normalizeStructurePattern(result.pattern);
        const derivedPattern = deriveStructurePattern(candidateSpans);
        const structureReliable = Boolean(statedPattern && statedPattern === derivedPattern);
        const spans = structureReliable ? candidateSpans : [];
        const pattern = structureReliable ? derivedPattern : '未完整识别';
        const normalized = { translation, phrases, pattern, spans, structureReliable };
        try {
            renderSentenceDetail(item, normalized);
        } catch (error) {
            console.warn('[Google News Navigator] Failed to render reading analysis', error);
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
        const normalized = spans
            .map((span) => normalizeSpan(span, text))
            .filter((span) => Number.isInteger(span.start)
                && Number.isInteger(span.end)
                && span.start >= 0
                && span.end > span.start
                && span.end <= text.length
                && ROLE_CLASS[span.role])
            .sort((a, b) => a.start - b.start || b.end - a.end);
        if (normalized.length > 4) return [];
        const seenRoles = new Set();
        let previous = null;
        for (const span of normalized) {
            if (seenRoles.has(span.role) || (previous && span.start < previous.end)) return [];
            seenRoles.add(span.role);
            previous = span;
        }
        return normalized;
    }

    function normalizeSpan(span, text) {
        const role = normalizeRole(span && span.role);
        const exactText = String(span && span.text || '').trim();
        if (!exactText || !ROLE_CLASS[role]) return { start: -1, end: -1, role };
        const matches = findStandaloneExactMatches(text, exactText);
        const start = Number(span && span.start);
        const end = Number(span && span.end);
        const offsetsValid = Number.isInteger(start)
            && Number.isInteger(end)
            && start >= 0
            && end > start
            && end <= text.length
            && text.slice(start, end) === exactText
            && hasStandaloneBoundaries(text, start, end);
        const offsetMatch = offsetsValid ? { start, end } : null;
        const hasOccurrence = span && span.occurrence !== undefined && span.occurrence !== null && span.occurrence !== '';
        const occurrence = Number(span && span.occurrence);
        const occurrenceMatch = Number.isInteger(occurrence) && occurrence >= 1
            ? matches[occurrence - 1] || null
            : null;
        if (hasOccurrence && !occurrenceMatch) return { start: -1, end: -1, role };
        if (offsetMatch && occurrenceMatch
            && (offsetMatch.start !== occurrenceMatch.start || offsetMatch.end !== occurrenceMatch.end)) {
            return { start: -1, end: -1, role };
        }
        if (occurrenceMatch) return { ...occurrenceMatch, role };
        if (offsetMatch) return { ...offsetMatch, role };
        if (matches.length === 1) return { ...matches[0], role };
        if (Number.isInteger(start) && matches.length > 1) {
            const ranked = matches
                .map((match) => ({ match, distance: Math.abs(match.start - start) }))
                .sort((left, right) => left.distance - right.distance);
            const tolerance = Math.max(2, Math.round(exactText.length * 0.15));
            if (ranked[0].distance <= tolerance
                && (!ranked[1] || ranked[1].distance > ranked[0].distance)) {
                return { ...ranked[0].match, role };
            }
        }
        return { start: -1, end: -1, role };
    }

    function findStandaloneExactMatches(text, exactText) {
        const matches = [];
        let cursor = 0;
        while (cursor <= text.length - exactText.length) {
            const start = text.indexOf(exactText, cursor);
            if (start < 0) break;
            const end = start + exactText.length;
            if (hasStandaloneBoundaries(text, start, end)) matches.push({ start, end });
            cursor = start + Math.max(1, exactText.length);
        }
        return matches;
    }

    function hasStandaloneBoundaries(text, start, end) {
        const startsWithWord = isWordCharacter(text[start]);
        const endsWithWord = isWordCharacter(text[end - 1]);
        if (startsWithWord && start > 0 && isWordCharacter(text[start - 1])) return false;
        if (endsWithWord && end < text.length && isWordCharacter(text[end])) return false;
        return true;
    }

    function isWordCharacter(character) {
        return Boolean(character && /[\p{L}\p{N}_]/u.test(character));
    }

    function deriveStructurePattern(spans) {
        const roles = new Set(spans.map((span) => span.role));
        if (!roles.has('subject') || !roles.has('predicate')) return '未完整识别';
        if (roles.has('object') && roles.has('complement')) return 'SVOC';
        if (roles.has('object')) return 'SVO';
        if (roles.has('complement')) return 'SVC';
        return 'SV';
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
        const structureHtml = result.structureReliable && result.spans.length
            ? result.spans.map((span) => `
                <span class="rer-structure-row">
                    <span class="rer-role-label" data-role="${escapeHtml(span.role)}">${escapeHtml(ROLE_LABEL[span.role] || span.role)}</span>
                    <span>${escapeHtml(item.text.slice(span.start, span.end))}</span>
                </span>
            `).join('')
            : '<span class="rer-help">未能可靠定位，已省略结构高亮</span>';
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

    function renderUnloadedDetail(item, message = '') {
        if (item.ready) return;
        const isHeadline = item.kind === 'headline';
        const emptyMessage = message || (isHeadline ? '本标题尚未精读' : '本句尚未精读');
        item.detailNode.innerHTML = `
            <span class="rer-detail-empty">
                <span class="rer-detail-empty-copy">${escapeHtml(emptyMessage)}</span>
                <span class="rer-detail-actions">
                    <button type="button" class="rer-button rer-button-primary" data-rer-sentence-action="load-one" data-rer-sentence-id="${escapeHtml(item.id)}">${isHeadline ? '精读标题' : '精读本句'}</button>
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
