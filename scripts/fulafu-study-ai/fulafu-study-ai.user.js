// ==UserScript==
// @name         Fulafu Study AI Assistant
// @name:zh-CN   Fulafu 学习 AI 助手
// @name:en      Fulafu Study AI Assistant
// @namespace    https://scripts.fulafu.com/
// @version      1.3.0
// @lastUpdated  2026-08-30 22:48
// @description  Add paragraph-level AI questions to Fulafu Study, with local API settings, formula-aware context, and follow-up conversations.
// @description:zh-CN 为 Fulafu Study 添加段落级 AI 提问、本地 API 设置、公式友好的原文引用与连续追问。
// @description:en Add paragraph-level AI questions to Fulafu Study, with local API settings, formula-aware context, and follow-up conversations.
// @author       ZhangNingYA
// @homepageURL  https://scripts.fulafu.com/scripts/fulafu-study-ai/
// @supportURL   https://github.com/ZhangNingYA/userscripts/issues
// @updateURL    https://scripts.fulafu.com/scripts/fulafu-study-ai/fulafu-study-ai.user.js
// @downloadURL  https://scripts.fulafu.com/scripts/fulafu-study-ai/fulafu-study-ai.user.js
// @match        https://www.fulafu.com/study/*
// @match        https://fulafu.com/study/*
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

    const SCRIPT_VERSION = '1.3.0';
    const SCRIPT_RELEASED_AT = '2026-08-30 22:48:23 UTC+8';
    const ROOT_ID = 'fulafu-study-ai-root';
    const PANEL_ID = 'fulafu-study-ai-panel';
    const STYLE_ID = 'fulafu-study-ai-style';
    const BUTTON_CLASS = 'fulafu-study-ai-ask';
    const DECORATED_ATTRIBUTE = 'data-fulafu-study-ai-ready';
    const STORAGE_KEY = 'fulafu-study-ai-config-v1';
    const DEFAULT_CONFIG = Object.freeze({
        endpoint: 'https://api.openai.com/v1/responses',
        model: 'gpt-5.6',
        apiKey: ''
    });
    const MAX_CONTEXT_LENGTH = 12000;
    const REQUEST_TIMEOUT_MS = 120000;
    const MIN_QUESTIONABLE_LENGTH = 8;

    let config = loadConfig();
    let elements = null;
    let currentContext = '';
    let history = [];
    let activeRequest = null;
    let lastFocusedElement = null;
    let decorationFrame = 0;
    let contextRevision = 0;

    const css = String.raw`
        .${BUTTON_CLASS} {
            box-sizing: border-box !important;
            display: inline-grid !important;
            width: 1.18em !important;
            height: 1.5em !important;
            min-width: 0 !important;
            min-height: 0 !important;
            place-items: center !important;
            margin: 0 0 0 .02em !important;
            padding: 0 !important;
            color: inherit !important;
            background: transparent !important;
            border: 0 !important;
            border-radius: .25em !important;
            box-shadow: none !important;
            font: inherit !important;
            font-size: .94em !important;
            line-height: 1 !important;
            letter-spacing: 0 !important;
            opacity: .7 !important;
            text-decoration: none !important;
            vertical-align: .06em !important;
            cursor: pointer !important;
            appearance: none !important;
            -webkit-tap-highlight-color: transparent !important;
            transition: opacity 140ms ease, transform 140ms ease !important;
        }

        .${BUTTON_CLASS}:hover {
            color: inherit !important;
            background: transparent !important;
            opacity: 1 !important;
        }

        .${BUTTON_CLASS}:active {
            transform: scale(.9) !important;
        }

        .${BUTTON_CLASS}:focus-visible,
        #${ROOT_ID} button:focus-visible,
        #${ROOT_ID} input:focus-visible,
        #${ROOT_ID} textarea:focus-visible {
            outline: 3px solid rgba(41, 105, 77, .28) !important;
            outline-offset: 2px !important;
        }

        #${ROOT_ID},
        #${ROOT_ID} *,
        #${ROOT_ID} *::before,
        #${ROOT_ID} *::after {
            box-sizing: border-box;
        }

        #${ROOT_ID} {
            position: fixed;
            inset: 0;
            z-index: 2147483646;
            display: block;
            color: #26332d;
            font: 14px/1.55 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
            letter-spacing: 0;
            pointer-events: none;
        }

        #${ROOT_ID}[hidden],
        #${ROOT_ID} [hidden] {
            display: none !important;
        }

        #${ROOT_ID} .fulafu-study-ai-backdrop {
            position: absolute;
            inset: 0;
            background: transparent;
            pointer-events: none;
        }

        #${ROOT_ID} .fulafu-study-ai-mini {
            position: absolute;
            right: max(16px, env(safe-area-inset-right));
            bottom: max(16px, env(safe-area-inset-bottom));
            display: grid;
            width: 48px;
            min-width: 48px;
            height: 48px;
            min-height: 48px;
            place-items: center;
            padding: 0;
            color: #fff;
            background: #2f6b51;
            border: 1px solid rgba(255, 255, 255, .45);
            border-radius: 50%;
            box-shadow: 0 10px 30px rgba(20, 45, 34, .26);
            font-size: 19px;
            line-height: 1;
            pointer-events: auto;
        }

        #${ROOT_ID} .fulafu-study-ai-mini:hover {
            background: #285d47;
        }

        #${PANEL_ID} {
            position: absolute;
            right: max(16px, env(safe-area-inset-right));
            bottom: max(16px, env(safe-area-inset-bottom));
            display: flex;
            width: min(420px, calc(100vw - 32px));
            max-height: calc(100vh - 32px);
            max-height: calc(100dvh - 32px);
            min-width: 0;
            flex-direction: column;
            overflow: hidden;
            color: #26332d;
            background: #fbfcfb;
            border: 1px solid rgba(38, 64, 52, .14);
            border-radius: 18px;
            box-shadow: 0 20px 70px rgba(17, 38, 29, .24);
            pointer-events: auto;
        }

        #${ROOT_ID} button,
        #${ROOT_ID} input,
        #${ROOT_ID} textarea {
            color: inherit;
            font: inherit;
            letter-spacing: 0;
        }

        #${ROOT_ID} button {
            min-height: 38px;
            border: 0;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
        }

        #${ROOT_ID} .fulafu-study-ai-header {
            display: flex;
            min-height: 58px;
            flex: 0 0 auto;
            align-items: center;
            gap: 9px;
            padding: 9px 10px 9px 14px;
            background: rgba(251, 252, 251, .96);
            border-bottom: 1px solid rgba(38, 64, 52, .1);
        }

        #${ROOT_ID} .fulafu-study-ai-brand-mark {
            display: grid;
            width: 30px;
            height: 30px;
            flex: 0 0 30px;
            place-items: center;
            color: #2f6b51;
            background: #e9f2ed;
            border-radius: 9px;
            font-size: 15px;
            line-height: 1;
        }

        #${ROOT_ID} .fulafu-study-ai-heading {
            min-width: 0;
            flex: 1;
            font-size: 15px;
            line-height: 1.25;
        }

        #${ROOT_ID} .fulafu-study-ai-header-actions {
            display: flex;
            gap: 2px;
        }

        #${ROOT_ID} .fulafu-study-ai-icon-button {
            display: inline-grid;
            width: 38px;
            min-width: 38px;
            height: 38px;
            place-items: center;
            padding: 0;
            color: #627068;
            background: transparent;
            border-radius: 10px;
            font-size: 18px;
            line-height: 1;
        }

        #${ROOT_ID} .fulafu-study-ai-icon-button:hover,
        #${ROOT_ID} .fulafu-study-ai-icon-button[data-active="true"] {
            color: #245b43;
            background: #eaf1ed;
        }

        #${ROOT_ID} .fulafu-study-ai-body,
        #${ROOT_ID} .fulafu-study-ai-chat-view {
            display: flex;
            min-height: 0;
            flex-direction: column;
        }

        #${ROOT_ID} .fulafu-study-ai-body {
            overflow: hidden;
        }

        #${ROOT_ID} .fulafu-study-ai-settings {
            max-height: min(620px, calc(100vh - 92px));
            max-height: min(620px, calc(100dvh - 92px));
            padding: 18px;
            overflow-y: auto;
            overscroll-behavior: contain;
        }

        #${ROOT_ID} .fulafu-study-ai-settings-title {
            margin-bottom: 14px;
            font-size: 15px;
        }

        #${ROOT_ID} .fulafu-study-ai-field {
            display: block;
            margin-top: 12px;
            color: #526159;
            font-size: 12px;
            font-weight: 700;
        }

        #${ROOT_ID} .fulafu-study-ai-field input,
        #${ROOT_ID} .fulafu-study-ai-context,
        #${ROOT_ID} .fulafu-study-ai-question {
            display: block;
            width: 100%;
            color: #26332d;
            background: #fff;
            border: 1px solid rgba(41, 69, 56, .2);
            outline: 0;
        }

        #${ROOT_ID} .fulafu-study-ai-field input {
            min-height: 44px;
            margin-top: 6px;
            padding: 10px 12px;
            border-radius: 11px;
        }

        #${ROOT_ID} .fulafu-study-ai-advanced {
            margin-top: 14px;
            padding-top: 2px;
        }

        #${ROOT_ID} .fulafu-study-ai-advanced summary {
            color: #526159;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
        }

        #${ROOT_ID} .fulafu-study-ai-settings-actions {
            display: flex;
            align-items: center;
            gap: 9px;
            margin-top: 18px;
        }

        #${ROOT_ID} .fulafu-study-ai-primary,
        #${ROOT_ID} .fulafu-study-ai-secondary {
            min-height: 42px;
            padding: 8px 15px;
            border-radius: 11px;
            font-weight: 700;
        }

        #${ROOT_ID} .fulafu-study-ai-primary {
            color: #fff;
            background: #2f6b51;
        }

        #${ROOT_ID} .fulafu-study-ai-primary:hover {
            background: #275d46;
        }

        #${ROOT_ID} .fulafu-study-ai-secondary {
            color: #45564d;
            background: #e9efeb;
        }

        #${ROOT_ID} .fulafu-study-ai-status {
            margin: 8px 0 0;
            color: #68766e;
            font-size: 12px;
        }

        #${ROOT_ID} .fulafu-study-ai-status[data-kind="error"] {
            color: #a23d35;
        }

        #${ROOT_ID} .fulafu-study-ai-status:empty {
            display: none;
        }

        #${ROOT_ID} .fulafu-study-ai-conversation {
            display: flex;
            max-height: min(48vh, 440px);
            max-height: min(48dvh, 440px);
            min-height: 0;
            flex-direction: column;
            gap: 14px;
            padding: 16px 16px 4px;
            overflow-y: auto;
            overscroll-behavior: contain;
            scrollbar-width: thin;
        }

        #${ROOT_ID} .fulafu-study-ai-conversation:empty {
            display: none;
        }

        #${ROOT_ID} .fulafu-study-ai-message {
            max-width: 90%;
            overflow-wrap: anywhere;
            white-space: pre-wrap;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="user"] {
            align-self: flex-end;
            padding: 9px 12px;
            color: #26372f;
            background: #e5f0e9;
            border-radius: 14px 14px 4px 14px;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] {
            align-self: stretch;
            max-width: 100%;
            padding: 2px 3px;
            color: #26332d;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"]:empty::after {
            content: "•••";
            color: #809087;
            letter-spacing: 3px;
        }

        #${ROOT_ID} .fulafu-study-ai-composer {
            flex: 0 0 auto;
            padding: 14px 16px max(14px, env(safe-area-inset-bottom));
        }

        #${ROOT_ID} .fulafu-study-ai-context-card {
            margin-bottom: 10px;
            padding: 9px 10px;
            background: #f0f4f1;
            border: 1px solid rgba(41, 69, 56, .1);
            border-radius: 11px;
        }

        #${ROOT_ID} .fulafu-study-ai-context-head {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        #${ROOT_ID} .fulafu-study-ai-context-label {
            flex: 0 0 auto;
            color: #2e6a50;
            font-size: 11px;
            font-weight: 700;
        }

        #${ROOT_ID} .fulafu-study-ai-context-preview {
            min-width: 0;
            flex: 1;
            overflow: hidden;
            color: #66736c;
            font-size: 11px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${ROOT_ID} .fulafu-study-ai-context-toggle {
            min-height: 28px;
            flex: 0 0 auto;
            padding: 2px 5px;
            color: #526159;
            background: transparent;
            border-radius: 7px;
            font-size: 11px;
        }

        #${ROOT_ID} .fulafu-study-ai-context-toggle:hover {
            background: #e2eae5;
        }

        #${ROOT_ID} .fulafu-study-ai-context {
            min-height: 74px;
            max-height: 160px;
            margin-top: 8px;
            padding: 9px 10px;
            border-radius: 9px;
            font-size: 12px;
            line-height: 1.5;
            resize: vertical;
        }

        #${ROOT_ID} .fulafu-study-ai-question-shell {
            display: flex;
            align-items: flex-end;
            gap: 8px;
            padding: 7px 7px 7px 12px;
            background: #fff;
            border: 1px solid rgba(41, 69, 56, .22);
            border-radius: 15px;
            box-shadow: 0 4px 16px rgba(27, 53, 41, .06);
        }

        #${ROOT_ID} .fulafu-study-ai-question-shell:focus-within {
            border-color: rgba(39, 105, 76, .55);
            box-shadow: 0 0 0 3px rgba(39, 105, 76, .1);
        }

        #${ROOT_ID} .fulafu-study-ai-question {
            min-height: 34px;
            max-height: 144px;
            padding: 6px 0;
            background: transparent;
            border: 0;
            line-height: 1.55;
            resize: none;
        }

        #${ROOT_ID} .fulafu-study-ai-send {
            display: grid;
            width: 38px;
            min-width: 38px;
            height: 38px;
            min-height: 38px;
            place-items: center;
            padding: 0;
            color: #fff;
            background: #2f6b51;
            border-radius: 11px;
            font-size: 20px;
            line-height: 1;
        }

        #${ROOT_ID} .fulafu-study-ai-send:hover {
            background: #275d46;
        }

        #${ROOT_ID} .fulafu-study-ai-send[data-busy="true"] {
            background: #9a5b49;
            font-size: 14px;
        }

        @media (max-width: 640px) {
            .${BUTTON_CLASS} {
                width: 40px !important;
                height: 40px !important;
                margin: -10px -8px -10px -.36em !important;
                font-size: .94em !important;
            }

            #${PANEL_ID} {
                right: 0;
                bottom: 0;
                width: 100vw;
                max-height: calc(100vh - max(12px, env(safe-area-inset-top)));
                max-height: calc(100dvh - max(12px, env(safe-area-inset-top)));
                border-width: 1px 0 0;
                border-radius: 20px 20px 0 0;
                box-shadow: 0 -12px 50px rgba(17, 38, 29, .2);
            }

            #${ROOT_ID} .fulafu-study-ai-backdrop {
                background: rgba(19, 27, 23, .16);
                pointer-events: auto;
            }

            #${ROOT_ID} .fulafu-study-ai-header {
                min-height: 60px;
                padding-inline: 14px 8px;
            }

            #${ROOT_ID} button {
                min-height: 44px;
            }

            #${ROOT_ID} .fulafu-study-ai-icon-button {
                width: 42px;
                min-width: 42px;
                height: 44px;
            }

            #${ROOT_ID} .fulafu-study-ai-settings {
                max-height: calc(100vh - 74px - env(safe-area-inset-top));
                max-height: calc(100dvh - 74px - env(safe-area-inset-top));
                padding: 16px;
            }

            #${ROOT_ID} .fulafu-study-ai-conversation {
                max-height: min(50vh, 460px);
                max-height: min(50dvh, 460px);
                padding-inline: 14px;
            }

            #${ROOT_ID} .fulafu-study-ai-composer {
                padding-inline: 12px;
            }

            #${ROOT_ID} .fulafu-study-ai-context-toggle {
                min-height: 32px;
                padding-inline: 7px;
            }

            #${ROOT_ID} .fulafu-study-ai-send {
                width: 42px;
                min-width: 42px;
                height: 42px;
                min-height: 42px;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            .${BUTTON_CLASS} {
                transition: none !important;
            }
        }
    `;

    function safeGetValue(key, fallback) {
        try {
            if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
        } catch (error) {
            console.warn('[Fulafu Study AI] Unable to read settings.', error);
        }
        return fallback;
    }

    function safeSetValue(key, value) {
        try {
            if (typeof GM_setValue !== 'function') return false;
            GM_setValue(key, value);
            return true;
        } catch (error) {
            console.warn('[Fulafu Study AI] Unable to save settings.', error);
            return false;
        }
    }

    function loadConfig() {
        const stored = safeGetValue(STORAGE_KEY, null);
        if (!stored || typeof stored !== 'object') return { ...DEFAULT_CONFIG };
        const storedModel = typeof stored.model === 'string' ? stored.model.trim() : '';
        return {
            endpoint: typeof stored.endpoint === 'string' && stored.endpoint.trim() ? stored.endpoint.trim() : DEFAULT_CONFIG.endpoint,
            model: storedModel && storedModel !== 'gpt-5.6-luna' ? storedModel : DEFAULT_CONFIG.model,
            apiKey: typeof stored.apiKey === 'string' ? stored.apiKey.trim() : ''
        };
    }

    function addStyle() {
        try {
            if (typeof GM_addStyle === 'function') {
                GM_addStyle(css);
                return;
            }
        } catch (error) {
            console.warn('[Fulafu Study AI] Unable to add styles with the userscript API.', error);
        }
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        (document.head || document.documentElement).append(style);
    }

    function normalizeSpace(value) {
        return String(value || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[ \t\f\v]+/g, ' ')
            .replace(/ *\n */g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function extractReadableText(source) {
        const clone = source.cloneNode(true);
        clone.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => button.remove());
        clone.querySelectorAll('.katex').forEach((formula) => {
            const annotation = formula.querySelector('annotation[encoding="application/x-tex"]');
            const replacement = document.createTextNode(annotation?.textContent?.trim() ? ` $${annotation.textContent.trim()}$ ` : ` ${formula.getAttribute('aria-label') || ''} `);
            formula.replaceWith(replacement);
        });
        clone.querySelectorAll('[aria-hidden="true"]').forEach((element) => element.remove());
        return normalizeSpace(clone.textContent).slice(0, MAX_CONTEXT_LENGTH);
    }

    function isQuestionable(element) {
        if (element.hasAttribute(DECORATED_ATTRIBUTE)) return false;
        if (element.closest('astro-island, nav, header, footer, .study-checkpoint, .textbook-inspector, .textbook-rail')) return false;
        if (element.matches('li') && element.querySelector(':scope > p')) return false;
        const text = extractReadableText(element);
        return text.length >= MIN_QUESTIONABLE_LENGTH;
    }

    function makeAskButton(context) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = BUTTON_CLASS;
        button.textContent = '✦';
        button.title = '围绕这一段提问';
        button.setAttribute('aria-label', '围绕这一段内容向 AI 提问');
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openPanel(context, { focusSettings: !config.apiKey });
        });
        return button;
    }

    function decorateContent() {
        decorationFrame = 0;
        const content = document.querySelector('.textbook-content');
        if (!content) return;
        content.querySelectorAll('p, li').forEach((element) => {
            if (!isQuestionable(element)) return;
            const context = extractReadableText(element);
            element.setAttribute(DECORATED_ATTRIBUTE, 'true');
            element.append(document.createTextNode(' '), makeAskButton(context));
        });
    }

    function scheduleDecoration() {
        if (decorationFrame) return;
        decorationFrame = window.requestAnimationFrame(decorateContent);
    }

    function createPanel() {
        if (elements) return elements;
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.dataset.version = SCRIPT_VERSION;
        root.dataset.releasedAt = SCRIPT_RELEASED_AT;
        root.hidden = true;
        root.innerHTML = `
            <div class="fulafu-study-ai-backdrop" data-action="close" aria-hidden="true"></div>
            <button class="fulafu-study-ai-mini" type="button" data-action="restore" aria-label="展开学习 AI 助手" title="展开学习 AI 助手" hidden>✦</button>
            <aside id="${PANEL_ID}" role="dialog" aria-modal="true" aria-labelledby="fulafu-study-ai-title">
                <header class="fulafu-study-ai-header">
                    <span class="fulafu-study-ai-brand-mark" aria-hidden="true">✦</span>
                    <strong class="fulafu-study-ai-heading" id="fulafu-study-ai-title">问 AI</strong>
                    <div class="fulafu-study-ai-header-actions">
                        <button class="fulafu-study-ai-icon-button" type="button" data-action="settings" aria-label="连接设置" title="连接设置">⚙</button>
                        <button class="fulafu-study-ai-icon-button" type="button" data-action="minimize" aria-label="缩小 AI 助手" title="缩小">−</button>
                        <button class="fulafu-study-ai-icon-button" type="button" data-action="close" aria-label="关闭 AI 助手" title="关闭">×</button>
                    </div>
                </header>
                <div class="fulafu-study-ai-body">
                    <section class="fulafu-study-ai-settings" aria-label="连接设置" hidden>
                        <div class="fulafu-study-ai-settings-title"><strong>连接设置</strong></div>
                        <label class="fulafu-study-ai-field">API Key
                            <input type="password" name="apiKey" autocomplete="off" spellcheck="false" placeholder="粘贴你的 Key">
                        </label>
                        <label class="fulafu-study-ai-field">模型
                            <input type="text" name="model" autocomplete="off" spellcheck="false">
                        </label>
                        <details class="fulafu-study-ai-advanced" data-advanced>
                            <summary>高级设置</summary>
                            <label class="fulafu-study-ai-field">接口地址
                                <input type="url" name="endpoint" inputmode="url" autocomplete="off" spellcheck="false">
                            </label>
                        </details>
                        <div class="fulafu-study-ai-settings-actions">
                            <button class="fulafu-study-ai-primary" type="button" data-action="save-settings">保存</button>
                            <button class="fulafu-study-ai-secondary" type="button" data-action="hide-settings">取消</button>
                        </div>
                        <p class="fulafu-study-ai-status" data-settings-status aria-live="polite"></p>
                    </section>
                    <div class="fulafu-study-ai-chat-view" data-chat-view>
                        <div class="fulafu-study-ai-conversation" data-conversation aria-live="polite"></div>
                        <section class="fulafu-study-ai-composer" aria-label="提问区">
                            <div class="fulafu-study-ai-context-card">
                                <div class="fulafu-study-ai-context-head">
                                    <span class="fulafu-study-ai-context-label">引用段落</span>
                                    <span class="fulafu-study-ai-context-preview" data-context-preview></span>
                                    <button class="fulafu-study-ai-context-toggle" type="button" data-action="toggle-context">编辑</button>
                                </div>
                                <textarea class="fulafu-study-ai-context" id="fulafu-study-ai-context" data-context aria-label="当前段落内容" hidden></textarea>
                            </div>
                            <div class="fulafu-study-ai-question-shell">
                                <textarea class="fulafu-study-ai-question" data-question rows="1" aria-label="你的问题" placeholder="针对这段内容提问…"></textarea>
                                <button class="fulafu-study-ai-send" type="button" data-action="send" aria-label="发送问题" title="发送">↑</button>
                            </div>
                            <p class="fulafu-study-ai-status" data-request-status aria-live="polite"></p>
                        </section>
                    </div>
                </div>
            </aside>`;
        document.body.append(root);

        elements = {
            root,
            panel: root.querySelector(`#${PANEL_ID}`),
            backdrop: root.querySelector('.fulafu-study-ai-backdrop'),
            mini: root.querySelector('.fulafu-study-ai-mini'),
            title: root.querySelector('#fulafu-study-ai-title'),
            settingsButton: root.querySelector('[data-action="settings"]'),
            settings: root.querySelector('.fulafu-study-ai-settings'),
            advanced: root.querySelector('[data-advanced]'),
            chatView: root.querySelector('[data-chat-view]'),
            apiKey: root.querySelector('[name="apiKey"]'),
            endpoint: root.querySelector('[name="endpoint"]'),
            model: root.querySelector('[name="model"]'),
            settingsStatus: root.querySelector('[data-settings-status]'),
            conversation: root.querySelector('[data-conversation]'),
            context: root.querySelector('[data-context]'),
            contextPreview: root.querySelector('[data-context-preview]'),
            contextToggle: root.querySelector('[data-action="toggle-context"]'),
            question: root.querySelector('[data-question]'),
            send: root.querySelector('[data-action="send"]'),
            requestStatus: root.querySelector('[data-request-status]')
        };

        root.addEventListener('click', handlePanelClick);
        elements.context.addEventListener('input', updateContextPreview);
        elements.question.addEventListener('input', resizeQuestionInput);
        elements.question.addEventListener('keydown', (event) => {
            const keyboardSend = event.key === 'Enter'
                && !event.shiftKey
                && !event.isComposing
                && (!window.matchMedia('(pointer: coarse)').matches || event.ctrlKey || event.metaKey);
            if (keyboardSend) {
                event.preventDefault();
                if (activeRequest) abortActiveRequest();
                else void askAI();
            }
        });
        return elements;
    }

    function handlePanelClick(event) {
        const button = event.target.closest('button[data-action]');
        const backdrop = event.target.closest('.fulafu-study-ai-backdrop[data-action="close"]');
        const action = button?.dataset.action || backdrop?.dataset.action;
        if (!action) return;
        if (action === 'close') closePanel();
        if (action === 'minimize') minimizePanel();
        if (action === 'restore') restorePanel();
        if (action === 'settings') {
            if (elements.settings.hidden) showSettings();
            else hideSettings();
        }
        if (action === 'hide-settings') hideSettings();
        if (action === 'save-settings') saveSettings();
        if (action === 'toggle-context') toggleContextEditor();
        if (action === 'send') {
            if (activeRequest) abortActiveRequest();
            else void askAI();
        }
    }

    function fillSettings() {
        createPanel();
        elements.apiKey.value = config.apiKey;
        elements.endpoint.value = config.endpoint;
        elements.model.value = config.model;
        elements.advanced.open = config.endpoint !== DEFAULT_CONFIG.endpoint;
    }

    function validateEndpoint(value) {
        let parsed;
        try {
            parsed = new URL(value);
        } catch {
            throw new Error('API URL 不是有效网址。');
        }
        if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('API URL 必须使用 http 或 https。');
        if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
            throw new Error('远程 API URL 必须使用 https。');
        }
        return parsed.href;
    }

    function readSettingsForm() {
        const apiKey = elements.apiKey.value.trim();
        const endpoint = validateEndpoint(elements.endpoint.value.trim());
        const model = elements.model.value.trim();
        if (!apiKey) throw new Error('请先填写 API Key。');
        if (!model) throw new Error('请填写模型名称。');
        return { apiKey, endpoint, model };
    }

    function setStatus(target, message = '', kind = '') {
        target.textContent = message;
        if (kind) target.dataset.kind = kind;
        else delete target.dataset.kind;
    }

    function saveSettings() {
        try {
            config = readSettingsForm();
            const persisted = safeSetValue(STORAGE_KEY, config);
            setStatus(elements.settingsStatus, persisted ? '已保存。' : '已应用，刷新后需重新设置。', persisted ? 'success' : 'error');
            if (persisted) window.setTimeout(hideSettings, 350);
        } catch (error) {
            setStatus(elements.settingsStatus, error.message || '设置无效。', 'error');
        }
    }

    function showSettings({ focus = true } = {}) {
        fillSettings();
        elements.settings.hidden = false;
        elements.chatView.hidden = true;
        elements.settingsButton.dataset.active = 'true';
        elements.title.textContent = '连接设置';
        setStatus(elements.settingsStatus);
        if (focus) window.setTimeout(() => (config.apiKey ? elements.model : elements.apiKey).focus(), 0);
    }

    function hideSettings({ focus = true } = {}) {
        if (!elements) return;
        elements.settings.hidden = true;
        elements.chatView.hidden = false;
        elements.settingsButton.dataset.active = 'false';
        elements.title.textContent = '问 AI';
        if (focus) focusVisiblePanelControl();
    }

    function focusVisiblePanelControl() {
        if (!elements || elements.root.hidden) return;
        if (elements.panel.hidden) elements.mini.focus();
        else if (!elements.settings.hidden) (config.apiKey ? elements.model : elements.apiKey).focus();
        else elements.question.focus();
    }

    function updateContextPreview() {
        if (!elements) return;
        elements.contextPreview.textContent = normalizeSpace(elements.context.value) || '未选择内容';
    }

    function toggleContextEditor() {
        const willShow = elements.context.hidden;
        elements.context.hidden = !willShow;
        elements.contextToggle.textContent = willShow ? '完成' : '编辑';
        updateContextPreview();
        if (willShow) window.setTimeout(() => elements.context.focus(), 0);
        else elements.question.focus();
    }

    function resizeQuestionInput() {
        if (!elements) return;
        elements.question.style.height = 'auto';
        elements.question.style.height = `${Math.min(elements.question.scrollHeight, 144)}px`;
    }

    function showPanelChrome() {
        elements.root.hidden = false;
        elements.backdrop.hidden = false;
        elements.panel.hidden = false;
        elements.mini.hidden = true;
    }

    function minimizePanel() {
        if (!elements || elements.root.hidden || elements.panel.hidden) return;
        elements.backdrop.hidden = true;
        elements.panel.hidden = true;
        elements.mini.hidden = false;
        elements.mini.focus();
    }

    function restorePanel() {
        if (!elements) return;
        showPanelChrome();
        window.setTimeout(focusVisiblePanelControl, 0);
    }

    function openPanel(context = '', { focusSettings = false } = {}) {
        createPanel();
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const nextContext = normalizeSpace(context).slice(0, MAX_CONTEXT_LENGTH);
        if (nextContext && nextContext !== currentContext) {
            abortActiveRequest();
            currentContext = nextContext;
            contextRevision += 1;
            elements.context.value = currentContext;
            elements.context.hidden = true;
            elements.contextToggle.textContent = '编辑';
            updateContextPreview();
            elements.question.value = '';
            resizeQuestionInput();
            setStatus(elements.requestStatus);
        } else if (!elements.context.value && currentContext) {
            elements.context.value = currentContext;
            updateContextPreview();
        }
        showPanelChrome();
        document.documentElement.style.setProperty('--fulafu-study-ai-panel-open', '1');
        if (focusSettings || !config.apiKey) showSettings();
        else {
            hideSettings({ focus: false });
            window.setTimeout(() => elements.question.focus(), 0);
        }
    }

    function closePanel() {
        if (!elements || elements.root.hidden) return;
        elements.root.hidden = true;
        document.documentElement.style.removeProperty('--fulafu-study-ai-panel-open');
        if (lastFocusedElement?.isConnected) lastFocusedElement.focus();
    }

    function appendMessage(role, text) {
        const message = document.createElement('div');
        message.className = 'fulafu-study-ai-message';
        message.dataset.role = role;
        message.textContent = text;
        elements.conversation.append(message);
        elements.conversation.scrollTop = elements.conversation.scrollHeight;
        return message;
    }

    function getPromptContext() {
        const value = normalizeSpace(elements.context.value).slice(0, MAX_CONTEXT_LENGTH);
        if (!value) throw new Error('当前段落为空，请先填写要讨论的内容。');
        if (value !== currentContext) {
            currentContext = value;
            contextRevision += 1;
        }
        return value;
    }

    function buildInstructions() {
        return [
            '你是一个耐心、准确的中文学习助手。优先使用简体中文回答，除非用户明确要求其他语言。',
            '每一轮用户消息都包含当时正在阅读的引用段落。请结合本次访问中此前的问答和该轮引用回答。',
            '公式使用清楚的纯文本或 LaTeX 表示。不要假装引用段落包含它没有提供的信息。',
            `页面标题：${document.title}`
        ].join('\n');
    }

    function apiHistoryItem(item) {
        if (item.role !== 'user' || !item.context) return { role: item.role, content: item.content };
        return {
            role: 'user',
            content: `【本轮引用段落】\n${item.context}\n\n【问题】\n${item.content}`
        };
    }

    function isResponsesEndpoint(endpoint) {
        try {
            return /\/responses\/?$/i.test(new URL(endpoint).pathname);
        } catch {
            return false;
        }
    }

    function responsePayload() {
        const sessionHistory = history.map(apiHistoryItem);
        if (isResponsesEndpoint(config.endpoint)) {
            return {
                model: config.model,
                instructions: buildInstructions(),
                input: sessionHistory,
                max_output_tokens: 1600,
                store: false,
                stream: true
            };
        }
        return {
            model: config.model,
            messages: [
                { role: 'system', content: buildInstructions() },
                ...sessionHistory
            ],
            max_tokens: 1600,
            stream: true
        };
    }

    function parseApiResponse(data) {
        if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
        if (Array.isArray(data?.output)) {
            const texts = [];
            data.output.forEach((item) => {
                if (!Array.isArray(item?.content)) return;
                item.content.forEach((part) => {
                    if (typeof part?.text === 'string' && (part.type === 'output_text' || !part.type)) texts.push(part.text);
                });
            });
            if (texts.length) return texts.join('\n').trim();
        }
        const chatContent = data?.choices?.[0]?.message?.content;
        if (typeof chatContent === 'string' && chatContent.trim()) return chatContent.trim();
        if (Array.isArray(chatContent)) {
            const text = chatContent.map((part) => typeof part === 'string' ? part : part?.text || '').filter(Boolean).join('\n').trim();
            if (text) return text;
        }
        throw new Error('API 已返回结果，但没有找到可显示的文字。请检查接口 URL 与模型是否匹配。');
    }

    function apiErrorMessage(status, data, rawText) {
        const detail = data?.error?.message || data?.message || normalizeSpace(rawText).slice(0, 240);
        if (status === 401 || status === 403) return `认证失败（HTTP ${status}），请检查 API Key 和接口权限。${detail ? ` ${detail}` : ''}`;
        if (status === 429) return `请求过于频繁或额度不足（HTTP 429）。${detail ? ` ${detail}` : ''}`;
        return `API 请求失败（HTTP ${status || '未知'}）。${detail ? ` ${detail}` : ''}`;
    }

    function streamTextDelta(data) {
        if (data?.type === 'response.output_text.delta' && typeof data.delta === 'string') return data.delta;
        const content = data?.choices?.[0]?.delta?.content;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content.map((part) => typeof part === 'string' ? part : part?.text || '').join('');
        }
        return '';
    }

    function streamError(data) {
        if (data?.type === 'error') return data?.error?.message || data?.message || 'API 流式响应失败。';
        if (data?.type === 'response.failed') return data?.response?.error?.message || 'API 未能生成回答。';
        return '';
    }

    function requestAI(payload, onUpdate) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('当前 userscript 管理器不支持跨域请求。'));
                return;
            }
            let settled = false;
            let streamedText = '';
            let progressText = '';
            let eventBuffer = '';
            let eventError = '';
            let completedResponse = null;
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                callback(value);
            };
            const consumeEvent = (block) => {
                const rawData = block
                    .split(/\r?\n/)
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).trimStart())
                    .join('\n')
                    .trim();
                if (!rawData || rawData === '[DONE]') return;
                let data;
                try {
                    data = JSON.parse(rawData);
                } catch {
                    return;
                }
                const errorMessage = streamError(data);
                if (errorMessage) {
                    eventError = errorMessage;
                    return;
                }
                const delta = streamTextDelta(data);
                if (delta) {
                    streamedText += delta;
                    if (typeof onUpdate === 'function') onUpdate(streamedText);
                }
                if (data?.type === 'response.completed' && data.response) completedResponse = data.response;
            };
            const consumeProgress = (responseText, flush = false) => {
                if (typeof responseText !== 'string') return;
                let nextText = '';
                if (responseText.startsWith(progressText)) nextText = responseText.slice(progressText.length);
                else if (responseText !== progressText) nextText = responseText;
                progressText = responseText;
                eventBuffer += nextText;
                const blocks = eventBuffer.split(/\r?\n\r?\n/);
                eventBuffer = flush ? '' : blocks.pop() || '';
                if (flush && eventBuffer) blocks.push(eventBuffer);
                blocks.forEach(consumeEvent);
            };
            try {
                const handle = GM_xmlhttpRequest({
                    method: 'POST',
                    url: config.endpoint,
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'text/event-stream, application/json',
                        Authorization: `Bearer ${config.apiKey}`
                    },
                    data: JSON.stringify(payload),
                    responseType: 'text',
                    timeout: REQUEST_TIMEOUT_MS,
                    anonymous: true,
                    onprogress(response) {
                        try {
                            consumeProgress(response.responseText || '');
                        } catch {
                            // Some userscript managers expose responseText only after completion.
                        }
                    },
                    onload(response) {
                        let data = null;
                        try {
                            data = JSON.parse(response.responseText || '{}');
                        } catch {
                            data = null;
                        }
                        if (response.status < 200 || response.status >= 300) {
                            finish(reject, new Error(apiErrorMessage(response.status, data, response.responseText)));
                            return;
                        }
                        try {
                            consumeProgress(response.responseText || '', true);
                            if (eventError) throw new Error(eventError);
                            if (streamedText.trim()) {
                                finish(resolve, streamedText.trim());
                                return;
                            }
                            if (completedResponse) {
                                finish(resolve, parseApiResponse(completedResponse));
                                return;
                            }
                            finish(resolve, parseApiResponse(data));
                        } catch (error) {
                            finish(reject, error);
                        }
                    },
                    onerror() {
                        finish(reject, new Error('网络请求失败，请检查接口地址、网络连接和 userscript 的跨域授权。'));
                    },
                    ontimeout() {
                        finish(reject, new Error('API 请求超时，请稍后重试。'));
                    },
                    onabort() {
                        const error = new Error('请求已停止。');
                        error.name = 'AbortError';
                        finish(reject, error);
                    }
                });
                activeRequest = {
                    abort() {
                        try {
                            if (handle && typeof handle.abort === 'function') handle.abort();
                        } finally {
                            const error = new Error('请求已停止。');
                            error.name = 'AbortError';
                            finish(reject, error);
                        }
                    }
                };
            } catch (error) {
                finish(reject, error);
            }
        });
    }

    function setBusy(isBusy) {
        elements.send.dataset.busy = isBusy ? 'true' : 'false';
        elements.send.textContent = isBusy ? '■' : '↑';
        elements.send.setAttribute('aria-label', isBusy ? '停止回答' : '发送问题');
        elements.send.title = isBusy ? '停止' : '发送';
        elements.question.readOnly = isBusy;
        elements.context.readOnly = isBusy;
    }

    function abortActiveRequest() {
        if (!activeRequest) return;
        try {
            activeRequest.abort();
        } catch (error) {
            console.warn('[Fulafu Study AI] Unable to abort request.', error);
        }
    }

    async function askAI() {
        let question;
        let context;
        try {
            if (!config.apiKey) {
                showSettings();
                throw new Error('请先填写并保存 API Key。');
            }
            context = getPromptContext();
            question = normalizeSpace(elements.question.value);
            if (!question) throw new Error('请输入你的问题。');
            validateEndpoint(config.endpoint);
        } catch (error) {
            setStatus(elements.requestStatus, error.message || '无法发送问题。', 'error');
            return;
        }

        const revision = contextRevision;
        const userEntry = { role: 'user', content: question, context };
        history.push(userEntry);
        const userMessage = appendMessage('user', question);
        const assistantMessage = appendMessage('assistant', '');
        elements.question.value = '';
        resizeQuestionInput();
        setBusy(true);
        setStatus(elements.requestStatus, '正在回答…');

        let requestForTurn = null;
        try {
            const requestPromise = requestAI(responsePayload(), (partialAnswer) => {
                if (revision !== contextRevision) return;
                assistantMessage.textContent = partialAnswer;
                elements.conversation.scrollTop = elements.conversation.scrollHeight;
            });
            requestForTurn = activeRequest;
            const answer = await requestPromise;
            if (revision !== contextRevision) return;
            assistantMessage.textContent = answer;
            history.push({ role: 'assistant', content: answer });
            setStatus(elements.requestStatus);
        } catch (error) {
            const entryIndex = history.indexOf(userEntry);
            if (entryIndex !== -1) history.splice(entryIndex, 1);
            userMessage.remove();
            assistantMessage.remove();
            if (revision !== contextRevision) return;
            elements.question.value = question;
            resizeQuestionInput();
            if (error?.name === 'AbortError') {
                setStatus(elements.requestStatus, '请求已停止。');
            } else {
                setStatus(elements.requestStatus, error?.message || 'AI 请求失败。', 'error');
            }
        } finally {
            if (activeRequest === requestForTurn) {
                activeRequest = null;
                setBusy(false);
                focusVisiblePanelControl();
            }
        }
    }

    function registerMenuCommand() {
        try {
            if (typeof GM_registerMenuCommand !== 'function') return;
            GM_registerMenuCommand('打开学习 AI 助手 / API 设置', () => {
                openPanel(currentContext, { focusSettings: true });
            });
        } catch (error) {
            console.warn('[Fulafu Study AI] Unable to register menu command.', error);
        }
    }

    function handleGlobalKeydown(event) {
        if (event.key !== 'Escape' || !elements || elements.root.hidden) return;
        event.preventDefault();
        closePanel();
    }

    function init() {
        addStyle();
        decorateContent();
        registerMenuCommand();
        document.addEventListener('keydown', handleGlobalKeydown);
        if ('MutationObserver' in window) {
            const observer = new MutationObserver((mutations) => {
                if (mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => node instanceof Element && !node.closest(`#${ROOT_ID}`)))) {
                    scheduleDecoration();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
