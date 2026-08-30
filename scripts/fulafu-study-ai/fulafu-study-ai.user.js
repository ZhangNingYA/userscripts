// ==UserScript==
// @name         Fulafu Study AI Assistant
// @name:zh-CN   Fulafu 学习 AI 助手
// @name:en      Fulafu Study AI Assistant
// @namespace    https://scripts.fulafu.com/
// @version      1.1.0
// @lastUpdated  2026-08-30 17:13
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

    const SCRIPT_VERSION = '1.1.0';
    const SCRIPT_RELEASED_AT = '2026-08-30 17:13:11 UTC+8';
    const ROOT_ID = 'fulafu-study-ai-root';
    const PANEL_ID = 'fulafu-study-ai-panel';
    const STYLE_ID = 'fulafu-study-ai-style';
    const BUTTON_CLASS = 'fulafu-study-ai-ask';
    const DECORATED_ATTRIBUTE = 'data-fulafu-study-ai-ready';
    const STORAGE_KEY = 'fulafu-study-ai-config-v1';
    const DEFAULT_CONFIG = Object.freeze({
        endpoint: 'https://api.openai.com/v1/responses',
        model: 'gpt-5.6-luna',
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
            width: 1.45em !important;
            height: 1.45em !important;
            min-width: 0 !important;
            min-height: 0 !important;
            place-items: center !important;
            margin: 0 0 0 .12em !important;
            padding: 0 !important;
            color: inherit !important;
            background: transparent !important;
            border: 0 !important;
            border-radius: .25em !important;
            box-shadow: none !important;
            font: inherit !important;
            font-size: .82em !important;
            line-height: 1 !important;
            letter-spacing: 0 !important;
            opacity: .48 !important;
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
            opacity: .92 !important;
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
            color: #24312b;
            font: 14px/1.55 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
            letter-spacing: 0;
            pointer-events: none;
        }

        #${ROOT_ID}[hidden] {
            display: none !important;
        }

        #${ROOT_ID} .fulafu-study-ai-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(20, 27, 24, .32);
            opacity: 1;
            pointer-events: auto;
            backdrop-filter: blur(2px);
        }

        #${ROOT_ID} .fulafu-study-ai-backdrop[hidden],
        #${PANEL_ID}[hidden],
        #${ROOT_ID} .fulafu-study-ai-mini[hidden] {
            display: none !important;
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
            color: #315848;
            background: #f8faf8;
            border: 1px solid rgba(29, 51, 41, .18);
            border-radius: 50%;
            box-shadow: 0 8px 28px rgba(19, 35, 28, .2);
            font-size: 19px;
            line-height: 1;
            pointer-events: auto;
        }

        #${ROOT_ID} .fulafu-study-ai-mini:hover {
            background: #edf3ef;
        }

        #${PANEL_ID} {
            position: absolute;
            inset: 0 0 0 auto;
            display: flex;
            width: min(440px, calc(100vw - 28px));
            min-width: 0;
            flex-direction: column;
            overflow: hidden;
            color: #24312b;
            background: #f8faf8;
            border-left: 1px solid rgba(29, 51, 41, .15);
            box-shadow: -20px 0 60px rgba(19, 35, 28, .2);
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
            min-height: 40px;
            border: 0;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
        }

        #${ROOT_ID} .fulafu-study-ai-header {
            display: flex;
            min-height: 66px;
            flex: 0 0 auto;
            align-items: center;
            gap: 10px;
            padding: 10px 12px 10px 18px;
            background: rgba(248, 250, 248, .95);
            border-bottom: 1px solid rgba(29, 51, 41, .12);
        }

        #${ROOT_ID} .fulafu-study-ai-heading {
            min-width: 0;
            flex: 1;
        }

        #${ROOT_ID} .fulafu-study-ai-heading strong,
        #${ROOT_ID} .fulafu-study-ai-heading span {
            display: block;
        }

        #${ROOT_ID} .fulafu-study-ai-heading strong {
            font-size: 15px;
            line-height: 1.25;
        }

        #${ROOT_ID} .fulafu-study-ai-heading span {
            margin-top: 3px;
            overflow: hidden;
            color: #6b786f;
            font-size: 11px;
            line-height: 1.25;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${ROOT_ID} .fulafu-study-ai-icon-button {
            display: inline-grid;
            width: 40px;
            flex: 0 0 40px;
            place-items: center;
            padding: 0;
            color: #526259;
            background: transparent;
            border-radius: 10px;
            font-size: 20px;
        }

        #${ROOT_ID} .fulafu-study-ai-icon-button:hover {
            color: #1e3f31;
            background: #e9efeb;
        }

        #${ROOT_ID} .fulafu-study-ai-body {
            display: flex;
            min-height: 0;
            flex: 1;
            flex-direction: column;
            overflow-y: auto;
            overscroll-behavior: contain;
        }

        #${ROOT_ID} .fulafu-study-ai-settings {
            flex: 0 0 auto;
            padding: 15px 18px 17px;
            background: #f1f5f2;
            border-bottom: 1px solid rgba(29, 51, 41, .12);
        }

        #${ROOT_ID} .fulafu-study-ai-settings[hidden] {
            display: none;
        }

        #${ROOT_ID} .fulafu-study-ai-settings-title {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
        }

        #${ROOT_ID} .fulafu-study-ai-settings-title strong {
            font-size: 14px;
        }

        #${ROOT_ID} .fulafu-study-ai-settings-title span {
            color: #718078;
            font-size: 11px;
        }

        #${ROOT_ID} .fulafu-study-ai-field {
            display: block;
            margin-top: 10px;
            color: #536159;
            font-size: 12px;
            font-weight: 700;
        }

        #${ROOT_ID} .fulafu-study-ai-field input,
        #${ROOT_ID} .fulafu-study-ai-field textarea,
        #${ROOT_ID} .fulafu-study-ai-context,
        #${ROOT_ID} .fulafu-study-ai-question {
            display: block;
            width: 100%;
            margin-top: 5px;
            padding: 10px 11px;
            color: #24312b;
            background: #fff;
            border: 1px solid rgba(41, 69, 56, .2);
            border-radius: 10px;
            outline: 0;
            resize: vertical;
        }

        #${ROOT_ID} .fulafu-study-ai-field input {
            min-height: 42px;
        }

        #${ROOT_ID} .fulafu-study-ai-settings-help {
            margin: 10px 0 0;
            color: #6a776f;
            font-size: 11px;
            line-height: 1.55;
        }

        #${ROOT_ID} .fulafu-study-ai-settings-actions,
        #${ROOT_ID} .fulafu-study-ai-compose-actions {
            display: flex;
            align-items: center;
            gap: 9px;
            margin-top: 12px;
        }

        #${ROOT_ID} .fulafu-study-ai-primary,
        #${ROOT_ID} .fulafu-study-ai-secondary {
            min-height: 42px;
            padding: 8px 14px;
            border-radius: 10px;
            font-weight: 700;
        }

        #${ROOT_ID} .fulafu-study-ai-primary {
            color: #fff;
            background: #2e6c51;
        }

        #${ROOT_ID} .fulafu-study-ai-primary:hover {
            background: #245a43;
        }

        #${ROOT_ID} .fulafu-study-ai-primary[data-busy="true"] {
            background: #8a5a4a;
        }

        #${ROOT_ID} .fulafu-study-ai-secondary {
            color: #3f5148;
            background: #e4ebe6;
        }

        #${ROOT_ID} .fulafu-study-ai-status {
            min-height: 18px;
            margin: 9px 0 0;
            color: #69756e;
            font-size: 12px;
        }

        #${ROOT_ID} .fulafu-study-ai-status[data-kind="error"] {
            color: #9f362f;
        }

        #${ROOT_ID} .fulafu-study-ai-status[data-kind="success"] {
            color: #26724e;
        }

        #${ROOT_ID} .fulafu-study-ai-conversation {
            display: flex;
            min-height: 120px;
            flex: 1 0 auto;
            flex-direction: column;
            gap: 12px;
            padding: 16px 18px;
        }

        #${ROOT_ID} .fulafu-study-ai-empty {
            margin: auto 0;
            padding: 24px 14px;
            color: #758079;
            text-align: center;
        }

        #${ROOT_ID} .fulafu-study-ai-empty strong,
        #${ROOT_ID} .fulafu-study-ai-empty span {
            display: block;
        }

        #${ROOT_ID} .fulafu-study-ai-empty strong {
            color: #45554c;
            font-size: 14px;
        }

        #${ROOT_ID} .fulafu-study-ai-empty span {
            margin-top: 4px;
            font-size: 12px;
        }

        #${ROOT_ID} .fulafu-study-ai-message {
            max-width: 92%;
            padding: 10px 12px;
            border-radius: 12px;
            overflow-wrap: anywhere;
            white-space: pre-wrap;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="user"] {
            align-self: flex-end;
            color: #fff;
            background: #346d55;
            border-bottom-right-radius: 4px;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] {
            align-self: flex-start;
            color: #25332c;
            background: #e8eee9;
            border-bottom-left-radius: 4px;
        }

        #${ROOT_ID} .fulafu-study-ai-composer {
            position: sticky;
            bottom: 0;
            flex: 0 0 auto;
            padding: 14px 18px max(16px, env(safe-area-inset-bottom));
            background: rgba(248, 250, 248, .97);
            border-top: 1px solid rgba(29, 51, 41, .12);
        }

        #${ROOT_ID} .fulafu-study-ai-context-label {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            color: #56645c;
            font-size: 11px;
            font-weight: 700;
        }

        #${ROOT_ID} .fulafu-study-ai-context-label span:last-child {
            overflow: hidden;
            color: #819087;
            font-weight: 500;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${ROOT_ID} .fulafu-study-ai-context {
            height: 86px;
            min-height: 64px;
            margin-top: 6px;
            color: #445249;
            background: #f0f4f1;
            font-size: 12px;
            line-height: 1.5;
        }

        #${ROOT_ID} .fulafu-study-ai-question {
            min-height: 74px;
            max-height: 180px;
            margin-top: 10px;
            line-height: 1.5;
        }

        #${ROOT_ID} .fulafu-study-ai-compose-actions {
            justify-content: space-between;
        }

        #${ROOT_ID} .fulafu-study-ai-shortcut {
            color: #7a867f;
            font-size: 11px;
        }

        #${ROOT_ID} .fulafu-study-ai-send {
            min-width: 92px;
        }

        @media (max-width: 640px) {
            .${BUTTON_CLASS} {
                width: 40px !important;
                height: 40px !important;
                margin: -10px -5px -10px .08em !important;
                font-size: .82em !important;
            }

            #${PANEL_ID} {
                width: 100vw;
                border-left: 0;
                box-shadow: none;
            }

            #${ROOT_ID} .fulafu-study-ai-backdrop {
                display: none;
            }

            #${ROOT_ID} .fulafu-study-ai-header {
                padding-top: max(10px, env(safe-area-inset-top));
            }

            #${ROOT_ID} button {
                min-height: 44px;
            }

            #${ROOT_ID} .fulafu-study-ai-icon-button {
                width: 44px;
                flex-basis: 44px;
            }

            #${ROOT_ID} .fulafu-study-ai-settings,
            #${ROOT_ID} .fulafu-study-ai-conversation,
            #${ROOT_ID} .fulafu-study-ai-composer {
                padding-inline: 14px;
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
        return {
            endpoint: typeof stored.endpoint === 'string' && stored.endpoint.trim() ? stored.endpoint.trim() : DEFAULT_CONFIG.endpoint,
            model: typeof stored.model === 'string' && stored.model.trim() ? stored.model.trim() : DEFAULT_CONFIG.model,
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
        root.hidden = true;
        root.innerHTML = `
            <div class="fulafu-study-ai-backdrop" data-action="close" aria-hidden="true"></div>
            <button class="fulafu-study-ai-mini" type="button" data-action="restore" aria-label="展开学习 AI 助手" title="展开学习 AI 助手" hidden>✦</button>
            <aside id="${PANEL_ID}" role="dialog" aria-modal="true" aria-labelledby="fulafu-study-ai-title">
                <header class="fulafu-study-ai-header">
                    <div class="fulafu-study-ai-heading">
                        <strong id="fulafu-study-ai-title">学习 AI 助手</strong>
                        <span>v${SCRIPT_VERSION} · ${SCRIPT_RELEASED_AT}</span>
                    </div>
                    <button class="fulafu-study-ai-icon-button" type="button" data-action="settings" aria-label="打开 API 设置" title="API 设置">⚙</button>
                    <button class="fulafu-study-ai-icon-button" type="button" data-action="minimize" aria-label="缩小 AI 助手" title="缩小">−</button>
                    <button class="fulafu-study-ai-icon-button" type="button" data-action="close" aria-label="关闭 AI 助手" title="关闭">×</button>
                </header>
                <div class="fulafu-study-ai-body">
                    <section class="fulafu-study-ai-settings" aria-label="API 设置" hidden>
                        <div class="fulafu-study-ai-settings-title"><strong>API 设置</strong><span>仅保存在此 userscript 的本地存储</span></div>
                        <label class="fulafu-study-ai-field">API Key
                            <input type="password" name="apiKey" autocomplete="off" spellcheck="false" placeholder="粘贴你的 Key">
                        </label>
                        <label class="fulafu-study-ai-field">API URL
                            <input type="url" name="endpoint" inputmode="url" autocomplete="off" spellcheck="false">
                        </label>
                        <label class="fulafu-study-ai-field">模型
                            <input type="text" name="model" autocomplete="off" spellcheck="false">
                        </label>
                        <p class="fulafu-study-ai-settings-help">支持 OpenAI Responses API（URL 以 /responses 结尾）和常见的 Chat Completions 兼容接口。个人浏览器脚本无法像服务端密钥库一样保护 Key，请使用单独项目、用量上限和可撤销的 Key。</p>
                        <div class="fulafu-study-ai-settings-actions">
                            <button class="fulafu-study-ai-primary" type="button" data-action="save-settings">保存设置</button>
                            <button class="fulafu-study-ai-secondary" type="button" data-action="hide-settings">收起</button>
                        </div>
                        <p class="fulafu-study-ai-status" data-settings-status aria-live="polite"></p>
                    </section>
                    <div class="fulafu-study-ai-conversation" data-conversation aria-live="polite">
                        <div class="fulafu-study-ai-empty" data-empty><strong>这段内容已经就绪</strong><span>本次访问的问答会保留到刷新页面为止。</span></div>
                    </div>
                    <section class="fulafu-study-ai-composer" aria-label="提问区">
                        <label class="fulafu-study-ai-context-label" for="fulafu-study-ai-context"><span>当前段落</span><span>可以编辑后再发送</span></label>
                        <textarea class="fulafu-study-ai-context" id="fulafu-study-ai-context" data-context aria-label="当前段落内容"></textarea>
                        <textarea class="fulafu-study-ai-question" data-question aria-label="你的问题" placeholder="这段话是什么意思？"></textarea>
                        <div class="fulafu-study-ai-compose-actions">
                            <span class="fulafu-study-ai-shortcut">Ctrl / ⌘ + Enter 发送</span>
                            <button class="fulafu-study-ai-primary fulafu-study-ai-send" type="button" data-action="send">提问</button>
                        </div>
                        <p class="fulafu-study-ai-status" data-request-status aria-live="polite"></p>
                    </section>
                </div>
            </aside>`;
        document.body.append(root);

        elements = {
            root,
            panel: root.querySelector(`#${PANEL_ID}`),
            backdrop: root.querySelector('.fulafu-study-ai-backdrop'),
            mini: root.querySelector('.fulafu-study-ai-mini'),
            settings: root.querySelector('.fulafu-study-ai-settings'),
            apiKey: root.querySelector('[name="apiKey"]'),
            endpoint: root.querySelector('[name="endpoint"]'),
            model: root.querySelector('[name="model"]'),
            settingsStatus: root.querySelector('[data-settings-status]'),
            conversation: root.querySelector('[data-conversation]'),
            empty: root.querySelector('[data-empty]'),
            context: root.querySelector('[data-context]'),
            question: root.querySelector('[data-question]'),
            send: root.querySelector('[data-action="send"]'),
            requestStatus: root.querySelector('[data-request-status]')
        };

        root.addEventListener('click', handlePanelClick);
        elements.question.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
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
        if (action === 'settings') showSettings();
        if (action === 'hide-settings') hideSettings();
        if (action === 'save-settings') saveSettings();
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
            setStatus(elements.settingsStatus, persisted ? '已保存在 userscript 本地存储中。' : '当前会话已应用；本地存储不可用，刷新后需要重新填写。', persisted ? 'success' : 'error');
            if (persisted) window.setTimeout(hideSettings, 650);
        } catch (error) {
            setStatus(elements.settingsStatus, error.message || '设置无效。', 'error');
        }
    }

    function showSettings({ focus = true } = {}) {
        fillSettings();
        elements.settings.hidden = false;
        setStatus(elements.settingsStatus);
        if (focus) window.setTimeout(() => (config.apiKey ? elements.endpoint : elements.apiKey).focus(), 0);
    }

    function hideSettings() {
        if (!elements) return;
        elements.settings.hidden = true;
        focusVisiblePanelControl();
    }

    function focusVisiblePanelControl() {
        if (!elements || elements.root.hidden) return;
        (elements.panel.hidden ? elements.mini : elements.question).focus();
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
        window.setTimeout(() => elements.question.focus(), 0);
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
            elements.question.value = '';
            setStatus(elements.requestStatus);
        } else if (!elements.context.value && currentContext) {
            elements.context.value = currentContext;
        }
        showPanelChrome();
        document.documentElement.style.setProperty('--fulafu-study-ai-panel-open', '1');
        if (focusSettings || !config.apiKey) showSettings();
        else {
            elements.settings.hidden = true;
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
        elements.empty.hidden = true;
        const message = document.createElement('div');
        message.className = 'fulafu-study-ai-message';
        message.dataset.role = role;
        message.textContent = text;
        elements.conversation.append(message);
        message.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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
                store: false
            };
        }
        return {
            model: config.model,
            messages: [
                { role: 'system', content: buildInstructions() },
                ...sessionHistory
            ],
            max_tokens: 1600,
            stream: false
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

    function requestAI(payload) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('当前 userscript 管理器不支持跨域请求。'));
                return;
            }
            let settled = false;
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                callback(value);
            };
            try {
                const handle = GM_xmlhttpRequest({
                    method: 'POST',
                    url: config.endpoint,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${config.apiKey}`
                    },
                    data: JSON.stringify(payload),
                    timeout: REQUEST_TIMEOUT_MS,
                    anonymous: true,
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
        elements.send.textContent = isBusy ? '停止' : '提问';
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
        elements.question.value = '';
        setBusy(true);
        setStatus(elements.requestStatus, 'AI 正在阅读这一段…');

        let requestForTurn = null;
        try {
            const requestPromise = requestAI(responsePayload());
            requestForTurn = activeRequest;
            const answer = await requestPromise;
            if (revision !== contextRevision) return;
            history.push({ role: 'assistant', content: answer });
            appendMessage('assistant', answer);
            setStatus(elements.requestStatus, '回答完成。', 'success');
        } catch (error) {
            const entryIndex = history.indexOf(userEntry);
            if (entryIndex !== -1) history.splice(entryIndex, 1);
            userMessage.remove();
            if (revision !== contextRevision) return;
            elements.question.value = question;
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
