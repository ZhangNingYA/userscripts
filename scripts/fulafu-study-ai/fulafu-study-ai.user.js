// ==UserScript==
// @name         Fulafu Study AI Assistant
// @name:zh-CN   Fulafu 学习 AI 助手
// @name:en      Fulafu Study AI Assistant
// @namespace    https://scripts.fulafu.com/
// @version      1.4.2
// @lastUpdated  2026-08-31 11:30
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
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js
// @resource     FULAFU_STUDY_AI_KATEX_CSS https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_getResourceText
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_VERSION = '1.4.2';
    const SCRIPT_RELEASED_AT = '2026-08-31 11:30:04 UTC+8';
    const ROOT_ID = 'fulafu-study-ai-root';
    const PANEL_ID = 'fulafu-study-ai-panel';
    const STYLE_ID = 'fulafu-study-ai-style';
    const BUTTON_CLASS = 'fulafu-study-ai-ask';
    const FORMULA_BUTTON_CLASS = 'fulafu-study-ai-ask-formula';
    const FORMULA_WRAPPER_CLASS = 'fulafu-study-ai-formula-with-ask';
    const DECORATED_ATTRIBUTE = 'data-fulafu-study-ai-ready';
    const STORAGE_KEY = 'fulafu-study-ai-config-v1';
    const KATEX_RESOURCE_NAME = 'FULAFU_STUDY_AI_KATEX_CSS';
    const KATEX_ASSET_BASE = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/';
    const DEFAULT_CONFIG = Object.freeze({
        endpoint: 'https://api.openai.com/v1/responses',
        model: 'gpt-5.6',
        reasoningEffort: 'default',
        apiKey: ''
    });
    const REASONING_EFFORTS = new Set(['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
    const MAX_CONTEXT_LENGTH = 12000;
    const REQUEST_TIMEOUT_MS = 120000;
    const MIN_QUESTIONABLE_LENGTH = 8;
    const AI_ICON_SVG = `<svg class="fulafu-study-ai-face-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 1.75c-6.05 0-10.5 3.8-10.5 8.95 0 2.72 1.27 5.11 3.55 6.68l-.85 3.9a.75.75 0 0 0 1.06.83l4.06-2.08c.87.21 1.77.32 2.68.32 6.05 0 10.5-3.8 10.5-8.95S18.05 1.75 12 1.75Z"/><circle cx="8.7" cy="10.35" r="1.1" fill="var(--fulafu-study-ai-face-color, #fff)"/><circle cx="15.3" cy="10.35" r="1.1" fill="var(--fulafu-study-ai-face-color, #fff)"/><path d="M8.75 13.55c.82.88 1.9 1.32 3.25 1.32s2.43-.44 3.25-1.32" fill="none" stroke="var(--fulafu-study-ai-face-color, #fff)" stroke-linecap="round" stroke-width="1.5"/></svg>`;

    let config = loadConfig();
    let elements = null;
    let currentContext = '';
    let history = [];
    let activeRequest = null;
    let lastFocusedElement = null;
    let decorationFrame = 0;
    let contextRevision = 0;
    const assistantRenderStates = new WeakMap();

    const css = String.raw`
        .${BUTTON_CLASS} {
            box-sizing: border-box !important;
            display: inline-grid !important;
            width: 1.16em !important;
            height: 1.42em !important;
            min-width: 0 !important;
            min-height: 0 !important;
            place-items: center !important;
            margin: 0 0 0 -.03em !important;
            padding: 0 !important;
            color: inherit !important;
            background: transparent !important;
            border: 0 !important;
            border-radius: .25em !important;
            box-shadow: none !important;
            font: inherit !important;
            font-size: 1em !important;
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

        .${BUTTON_CLASS} .fulafu-study-ai-face-icon {
            display: block !important;
            width: 1.1em !important;
            height: 1.1em !important;
            overflow: visible !important;
            pointer-events: none !important;
        }

        .${BUTTON_CLASS}.${FORMULA_BUTTON_CLASS} {
            margin-left: .08em !important;
            vertical-align: .02em !important;
        }

        .katex-display[${DECORATED_ATTRIBUTE}] {
            overflow-x: auto !important;
            overflow-y: hidden !important;
            text-align: center !important;
        }

        .katex-display > .${FORMULA_WRAPPER_CLASS} {
            display: inline-flex !important;
            width: auto !important;
            align-items: center !important;
            vertical-align: middle !important;
        }

        .katex-display > .${FORMULA_WRAPPER_CLASS} > .katex-html {
            display: inline-block !important;
            width: auto !important;
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
        #${ROOT_ID} select:focus-visible,
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
            --fulafu-study-ai-face-color: #2f6b51;
        }

        #${ROOT_ID} .fulafu-study-ai-mini .fulafu-study-ai-face-icon {
            width: 27px;
            height: 27px;
        }

        #${ROOT_ID} .fulafu-study-ai-mini:hover {
            background: #285d47;
        }

        #${PANEL_ID} {
            position: absolute;
            right: max(16px, env(safe-area-inset-right));
            bottom: max(16px, env(safe-area-inset-bottom));
            display: flex;
            width: min(560px, calc(100vw - 32px));
            height: min(760px, calc(100vh - 32px));
            height: min(760px, calc(100dvh - 32px));
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

        #${ROOT_ID}[data-focus-mode="true"] .fulafu-study-ai-backdrop {
            background: rgba(17, 25, 21, .42);
            pointer-events: auto;
            backdrop-filter: blur(3px);
        }

        #${ROOT_ID}[data-focus-mode="true"] #${PANEL_ID} {
            inset: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
            width: auto;
            height: auto;
            max-height: none;
            border-radius: 20px;
            box-shadow: 0 24px 90px rgba(10, 25, 18, .34);
        }

        #${ROOT_ID} button,
        #${ROOT_ID} input,
        #${ROOT_ID} select,
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
            --fulafu-study-ai-face-color: #e9f2ed;
        }

        #${ROOT_ID} .fulafu-study-ai-brand-mark .fulafu-study-ai-face-icon {
            width: 21px;
            height: 21px;
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

        #${ROOT_ID} .fulafu-study-ai-icon-button svg {
            width: 18px;
            height: 18px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.8;
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
            flex: 1;
            flex-direction: column;
        }

        #${ROOT_ID} .fulafu-study-ai-body {
            overflow: hidden;
        }

        #${ROOT_ID} .fulafu-study-ai-settings {
            flex: 1;
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
        #${ROOT_ID} .fulafu-study-ai-field select,
        #${ROOT_ID} .fulafu-study-ai-context,
        #${ROOT_ID} .fulafu-study-ai-question {
            display: block;
            width: 100%;
            color: #26332d;
            background: #fff;
            border: 1px solid rgba(41, 69, 56, .2);
            outline: 0;
        }

        #${ROOT_ID} .fulafu-study-ai-field input,
        #${ROOT_ID} .fulafu-study-ai-field select {
            min-height: 44px;
            margin-top: 6px;
            padding: 10px 12px;
            border-radius: 11px;
        }

        #${ROOT_ID} .fulafu-study-ai-field select {
            appearance: auto;
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
            min-height: 0;
            flex: 1;
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

        #${ROOT_ID} .fulafu-study-ai-chat-view {
            justify-content: flex-end;
        }

        #${ROOT_ID}[data-focus-mode="true"] .fulafu-study-ai-conversation,
        #${ROOT_ID}[data-focus-mode="true"] .fulafu-study-ai-composer,
        #${ROOT_ID}[data-focus-mode="true"] .fulafu-study-ai-settings {
            width: min(780px, 100%);
            margin-inline: auto;
        }

        #${ROOT_ID}[data-focus-mode="true"] .fulafu-study-ai-conversation {
            padding: 28px 30px 10px;
        }

        #${ROOT_ID}[data-focus-mode="true"] .fulafu-study-ai-message[data-role="assistant"] {
            font-size: 15px;
            line-height: 1.78;
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
            line-height: 1.68;
            white-space: normal;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"]:empty::after {
            content: "•••";
            color: #809087;
            letter-spacing: 3px;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] > :first-child {
            margin-top: 0;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] > :last-child {
            margin-bottom: 0;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] p,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] ul,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] ol,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] blockquote,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] pre,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] table,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] .fulafu-study-ai-math-block {
            margin: .48em 0;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] h1,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] h2,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] h3,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] h4,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] h5,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] h6 {
            margin: .78em 0 .32em;
            color: #20372c;
            font-weight: 750;
            line-height: 1.35;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] h1 {
            font-size: 1.28em;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] h2 {
            font-size: 1.18em;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] h3,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] h4,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] h5,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] h6 {
            font-size: 1.06em;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] ul,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] ol {
            padding-left: 1.45em;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] li + li {
            margin-top: .2em;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] blockquote {
            padding: .1em 0 .1em .85em;
            color: #58675f;
            border-left: 3px solid #a9c7b8;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] code {
            padding: .14em .38em;
            color: #284d3c;
            background: #edf2ef;
            border-radius: 5px;
            font: .9em/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] pre {
            max-width: 100%;
            padding: 11px 12px;
            overflow: auto;
            color: #e7eee9;
            background: #26342d;
            border-radius: 10px;
            white-space: pre;
            -webkit-overflow-scrolling: touch;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] pre code {
            padding: 0;
            color: inherit;
            background: transparent;
            border-radius: 0;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] a {
            color: #21674a;
            text-decoration: underline;
            text-decoration-color: rgba(33, 103, 74, .35);
            text-underline-offset: 2px;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] hr {
            height: 1px;
            margin: .75em 0;
            background: rgba(41, 69, 56, .16);
            border: 0;
        }

        #${ROOT_ID} .fulafu-study-ai-table-wrap {
            max-width: 100%;
            margin: .48em 0;
            overflow-x: auto;
            border: 1px solid rgba(41, 69, 56, .15);
            border-radius: 9px;
            -webkit-overflow-scrolling: touch;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] table {
            width: 100%;
            min-width: 280px;
            margin: 0;
            border-collapse: collapse;
            font-size: .92em;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] th,
        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] td {
            padding: 7px 9px;
            text-align: left;
            vertical-align: top;
            border-bottom: 1px solid rgba(41, 69, 56, .12);
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] th {
            color: #294a3b;
            background: #eef3f0;
            font-weight: 700;
        }

        #${ROOT_ID} .fulafu-study-ai-message[data-role="assistant"] tr:last-child td {
            border-bottom: 0;
        }

        #${ROOT_ID} .fulafu-study-ai-math-inline {
            display: inline-block;
            max-width: 100%;
            padding: 0 .05em;
            vertical-align: -.12em;
        }

        #${ROOT_ID} .fulafu-study-ai-math-block {
            max-width: 100%;
            padding: 4px 0;
            overflow-x: auto;
            overflow-y: hidden;
            text-align: center;
            -webkit-overflow-scrolling: touch;
        }

        #${ROOT_ID} .fulafu-study-ai-math-block .katex-display {
            margin: 0;
            text-align: center;
        }

        #${ROOT_ID} .fulafu-study-ai-math-fallback {
            color: #5c4941;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            white-space: pre-wrap;
        }

        #${ROOT_ID} .fulafu-study-ai-composer {
            flex: 0 0 auto;
            padding: 14px 16px max(14px, env(safe-area-inset-bottom));
            background: rgba(251, 252, 251, .98);
            border-top: 1px solid rgba(38, 64, 52, .08);
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
                margin: -10px -10px -10px -11px !important;
                font-size: .94em !important;
            }

            .${BUTTON_CLASS}.${FORMULA_BUTTON_CLASS} {
                margin-left: -10px !important;
            }

            #${PANEL_ID} {
                right: 0;
                bottom: 0;
                width: 100vw;
                height: min(88vh, 760px);
                height: min(88dvh, 760px);
                max-height: calc(100vh - max(12px, env(safe-area-inset-top)));
                max-height: calc(100dvh - max(12px, env(safe-area-inset-top)));
                border-width: 1px 0 0;
                border-radius: 20px 20px 0 0;
                box-shadow: 0 -12px 50px rgba(17, 38, 29, .2);
            }

            #${ROOT_ID}[data-focus-mode="true"] #${PANEL_ID} {
                inset: 0;
                width: 100vw;
                height: 100vh;
                height: 100dvh;
                border-width: 0;
                border-radius: 0;
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

            #${ROOT_ID} .fulafu-study-ai-conversation,
            #${ROOT_ID}[data-focus-mode="true"] .fulafu-study-ai-conversation {
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
        const storedEndpoint = typeof stored.endpoint === 'string' && stored.endpoint.trim() ? stored.endpoint.trim() : DEFAULT_CONFIG.endpoint;
        const storedModel = typeof stored.model === 'string' ? stored.model.trim() : '';
        const model = storedModel === 'gpt-5.6-luna' && storedEndpoint === DEFAULT_CONFIG.endpoint ? DEFAULT_CONFIG.model : storedModel || DEFAULT_CONFIG.model;
        const storedReasoningEffort = typeof stored.reasoningEffort === 'string' ? stored.reasoningEffort.trim().toLowerCase() : '';
        return {
            endpoint: storedEndpoint,
            model,
            reasoningEffort: REASONING_EFFORTS.has(storedReasoningEffort) ? storedReasoningEffort : DEFAULT_CONFIG.reasoningEffort,
            apiKey: typeof stored.apiKey === 'string' ? stored.apiKey.trim() : ''
        };
    }

    function getKatexCss() {
        try {
            if (typeof GM_getResourceText !== 'function') return '';
            const resource = GM_getResourceText(KATEX_RESOURCE_NAME);
            if (typeof resource !== 'string') return '';
            return resource.replace(/url\((['"]?)fonts\//g, `url($1${KATEX_ASSET_BASE}fonts/`);
        } catch (error) {
            console.warn('[Fulafu Study AI] Unable to load bundled KaTeX styles.', error);
            return '';
        }
    }

    function addStyle() {
        const styles = `${getKatexCss()}\n${css}`;
        try {
            if (typeof GM_addStyle === 'function') {
                GM_addStyle(styles);
                return;
            }
        } catch (error) {
            console.warn('[Fulafu Study AI] Unable to add styles with the userscript API.', error);
        }
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = styles;
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

    function isQuestionableFormula(element) {
        if (element.querySelector(`:scope > .katex > .${BUTTON_CLASS}`)) return false;
        if (element.closest('p, li, nav, header, footer, .study-checkpoint, .textbook-inspector, .textbook-rail')) return false;
        return extractReadableText(element).length >= 3;
    }

    function makeAskButton(context, { formula = false } = {}) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = BUTTON_CLASS;
        if (formula) button.classList.add(FORMULA_BUTTON_CLASS);
        button.innerHTML = AI_ICON_SVG;
        button.title = formula ? '围绕这个公式提问' : '围绕这一段提问';
        button.setAttribute('aria-label', formula ? '围绕这个公式向 AI 提问' : '围绕这一段内容向 AI 提问');
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
            element.append(makeAskButton(context));
        });
        content.querySelectorAll('.katex-display').forEach((element) => {
            if (!isQuestionableFormula(element)) return;
            const context = extractReadableText(element);
            const formula = element.querySelector(':scope > .katex');
            if (!formula) return;
            element.setAttribute(DECORATED_ATTRIBUTE, 'true');
            formula.classList.add(FORMULA_WRAPPER_CLASS);
            formula.append(makeAskButton(context, { formula: true }));
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
        root.dataset.focusMode = 'false';
        root.hidden = true;
        root.innerHTML = `
            <div class="fulafu-study-ai-backdrop" data-action="close" aria-hidden="true"></div>
            <button class="fulafu-study-ai-mini" type="button" data-action="restore" aria-label="展开学习 AI 助手" title="展开学习 AI 助手" hidden>${AI_ICON_SVG}</button>
            <aside id="${PANEL_ID}" role="dialog" aria-modal="false" aria-labelledby="fulafu-study-ai-title">
                <header class="fulafu-study-ai-header">
                    <span class="fulafu-study-ai-brand-mark" aria-hidden="true">${AI_ICON_SVG}</span>
                    <strong class="fulafu-study-ai-heading" id="fulafu-study-ai-title">问 AI</strong>
                    <div class="fulafu-study-ai-header-actions">
                        <button class="fulafu-study-ai-icon-button" type="button" data-action="settings" aria-label="连接设置" title="连接设置">⚙</button>
                        <button class="fulafu-study-ai-icon-button" type="button" data-action="focus-mode" aria-label="进入专注模式" title="专注模式"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/></svg></button>
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
                        <label class="fulafu-study-ai-field">推理强度
                            <select name="reasoningEffort">
                                <option value="default">自动（模型默认）</option>
                                <option value="none">none（关闭）</option>
                                <option value="minimal">minimal（最低）</option>
                                <option value="low">low（低）</option>
                                <option value="medium">medium（中）</option>
                                <option value="high">high（高）</option>
                                <option value="xhigh">xhigh（超高）</option>
                                <option value="max">max（最大）</option>
                            </select>
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
            focusButton: root.querySelector('[data-action="focus-mode"]'),
            settings: root.querySelector('.fulafu-study-ai-settings'),
            advanced: root.querySelector('[data-advanced]'),
            chatView: root.querySelector('[data-chat-view]'),
            apiKey: root.querySelector('[name="apiKey"]'),
            endpoint: root.querySelector('[name="endpoint"]'),
            model: root.querySelector('[name="model"]'),
            reasoningEffort: root.querySelector('[name="reasoningEffort"]'),
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
        if (action === 'focus-mode') setFocusMode(elements.root.dataset.focusMode !== 'true');
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
        elements.reasoningEffort.value = config.reasoningEffort;
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
        const reasoningEffort = elements.reasoningEffort.value;
        if (!apiKey) throw new Error('请先填写 API Key。');
        if (!model) throw new Error('请填写模型名称。');
        if (!REASONING_EFFORTS.has(reasoningEffort)) throw new Error('请选择有效的推理强度。');
        return { apiKey, endpoint, model, reasoningEffort };
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
        updatePanelHeading();
        setStatus(elements.settingsStatus);
        if (focus) window.setTimeout(() => (config.apiKey ? elements.model : elements.apiKey).focus(), 0);
    }

    function hideSettings({ focus = true } = {}) {
        if (!elements) return;
        elements.settings.hidden = true;
        elements.chatView.hidden = false;
        elements.settingsButton.dataset.active = 'false';
        updatePanelHeading();
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

    function updatePanelHeading() {
        if (!elements) return;
        if (!elements.settings.hidden) elements.title.textContent = '连接设置';
        else elements.title.textContent = elements.root.dataset.focusMode === 'true' ? '专注阅读' : '问 AI';
    }

    function setFocusMode(enabled) {
        if (!elements) return;
        const isEnabled = Boolean(enabled);
        elements.root.dataset.focusMode = isEnabled ? 'true' : 'false';
        elements.focusButton.dataset.active = isEnabled ? 'true' : 'false';
        elements.focusButton.setAttribute('aria-label', isEnabled ? '退出专注模式' : '进入专注模式');
        elements.focusButton.title = isEnabled ? '退出专注模式' : '专注模式';
        elements.panel.setAttribute('aria-modal', isEnabled || window.matchMedia('(max-width: 640px)').matches ? 'true' : 'false');
        updatePanelHeading();
        if (!elements.settings.hidden) elements.settings.scrollTop = 0;
        else elements.conversation.scrollTop = elements.conversation.scrollHeight;
    }

    function showPanelChrome() {
        elements.root.hidden = false;
        elements.backdrop.hidden = false;
        elements.panel.hidden = false;
        elements.mini.hidden = true;
        elements.panel.setAttribute('aria-modal', elements.root.dataset.focusMode === 'true' || window.matchMedia('(max-width: 640px)').matches ? 'true' : 'false');
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
        setFocusMode(false);
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

    function isEscaped(value, index) {
        let slashCount = 0;
        for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashCount += 1;
        return slashCount % 2 === 1;
    }

    function findClosingDelimiter(value, delimiter, fromIndex) {
        let cursor = fromIndex;
        while (cursor < value.length) {
            const found = value.indexOf(delimiter, cursor);
            if (found === -1) return -1;
            if (!isEscaped(value, found)) return found;
            cursor = found + delimiter.length;
        }
        return -1;
    }

    function safeLinkUrl(value) {
        try {
            const parsed = new URL(value, window.location.href);
            if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return '';
            return parsed.href;
        } catch {
            return '';
        }
    }

    function mathNode(tex, displayMode) {
        const node = document.createElement(displayMode ? 'div' : 'span');
        node.className = displayMode ? 'fulafu-study-ai-math-block' : 'fulafu-study-ai-math-inline';
        node.setAttribute('aria-label', tex);
        try {
            const renderer = globalThis.katex;
            if (!renderer || typeof renderer.render !== 'function') throw new Error('KaTeX is unavailable.');
            renderer.render(tex, node, {
                displayMode,
                throwOnError: false,
                strict: 'ignore',
                trust: false,
                output: 'htmlAndMathml'
            });
        } catch (error) {
            node.classList.add('fulafu-study-ai-math-fallback');
            node.textContent = displayMode ? `$$${tex}$$` : `$${tex}$`;
            console.warn('[Fulafu Study AI] Unable to render formula.', error);
        }
        return node;
    }

    function appendInlineMarkdown(parent, source) {
        const value = String(source || '');
        let cursor = 0;
        let buffer = '';
        const flush = () => {
            if (!buffer) return;
            parent.append(document.createTextNode(buffer));
            buffer = '';
        };
        const appendWrapped = (tagName, content) => {
            const element = document.createElement(tagName);
            appendInlineMarkdown(element, content);
            parent.append(element);
        };

        while (cursor < value.length) {
            if (value.startsWith('\\(', cursor) && !isEscaped(value, cursor)) {
                const closing = findClosingDelimiter(value, '\\)', cursor + 2);
                if (closing !== -1) {
                    flush();
                    parent.append(mathNode(value.slice(cursor + 2, closing).trim(), false));
                    cursor = closing + 2;
                    continue;
                }
            }

            if (value[cursor] === '$' && value[cursor + 1] !== '$' && !isEscaped(value, cursor) && !/\s/.test(value[cursor + 1] || '')) {
                const closing = findClosingDelimiter(value, '$', cursor + 1);
                if (closing !== -1 && !/\s/.test(value[closing - 1] || '')) {
                    flush();
                    parent.append(mathNode(value.slice(cursor + 1, closing), false));
                    cursor = closing + 1;
                    continue;
                }
            }

            if (value[cursor] === '`') {
                const ticks = value.slice(cursor).match(/^`+/)?.[0] || '`';
                const closing = value.indexOf(ticks, cursor + ticks.length);
                if (closing !== -1) {
                    flush();
                    const code = document.createElement('code');
                    code.textContent = value.slice(cursor + ticks.length, closing).replace(/^ | $/g, '');
                    parent.append(code);
                    cursor = closing + ticks.length;
                    continue;
                }
            }

            const linkMatch = value.slice(cursor).match(/^(!?)\[([^\]]+)\]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)/);
            if (linkMatch) {
                const href = safeLinkUrl(linkMatch[3]);
                if (href) {
                    flush();
                    const link = document.createElement('a');
                    link.href = href;
                    link.rel = 'noopener noreferrer';
                    if (href.startsWith('http')) link.target = '_blank';
                    appendInlineMarkdown(link, linkMatch[2]);
                    if (linkMatch[1]) link.setAttribute('aria-label', `图片：${linkMatch[2]}`);
                    parent.append(link);
                    cursor += linkMatch[0].length;
                    continue;
                }
            }

            const autoLinkMatch = value.slice(cursor).match(/^<(https?:\/\/[^>]+|mailto:[^>]+)>/i);
            if (autoLinkMatch) {
                const href = safeLinkUrl(autoLinkMatch[1]);
                if (href) {
                    flush();
                    const link = document.createElement('a');
                    link.href = href;
                    link.rel = 'noopener noreferrer';
                    link.target = href.startsWith('http') ? '_blank' : '';
                    link.textContent = autoLinkMatch[1];
                    parent.append(link);
                    cursor += autoLinkMatch[0].length;
                    continue;
                }
            }

            const strongDelimiter = value.startsWith('**', cursor) ? '**' : value.startsWith('__', cursor) ? '__' : '';
            if (strongDelimiter) {
                const closing = findClosingDelimiter(value, strongDelimiter, cursor + 2);
                if (closing > cursor + 2) {
                    flush();
                    appendWrapped('strong', value.slice(cursor + 2, closing));
                    cursor = closing + 2;
                    continue;
                }
            }

            if (value.startsWith('~~', cursor)) {
                const closing = findClosingDelimiter(value, '~~', cursor + 2);
                if (closing > cursor + 2) {
                    flush();
                    appendWrapped('del', value.slice(cursor + 2, closing));
                    cursor = closing + 2;
                    continue;
                }
            }

            if ((value[cursor] === '*' || value[cursor] === '_') && !isEscaped(value, cursor)) {
                const delimiter = value[cursor];
                const previous = value[cursor - 1] || '';
                const next = value[cursor + 1] || '';
                const allowEmphasis = delimiter === '*' || !(/[\p{L}\p{N}]/u.test(previous) && /[\p{L}\p{N}]/u.test(next));
                const closing = allowEmphasis ? findClosingDelimiter(value, delimiter, cursor + 1) : -1;
                if (closing > cursor + 1) {
                    flush();
                    appendWrapped('em', value.slice(cursor + 1, closing));
                    cursor = closing + 1;
                    continue;
                }
            }

            if (value[cursor] === '\\' && cursor + 1 < value.length && /[\\`*{}\[\]()#+.!_$|>~-]/.test(value[cursor + 1])) {
                buffer += value[cursor + 1];
                cursor += 2;
                continue;
            }

            if (value[cursor] === '\n') {
                flush();
                parent.append(document.createElement('br'));
                cursor += 1;
                continue;
            }

            buffer += value[cursor];
            cursor += 1;
        }
        flush();
    }

    function splitTableRow(line) {
        let value = String(line || '').trim();
        if (value.startsWith('|')) value = value.slice(1);
        if (value.endsWith('|') && !isEscaped(value, value.length - 1)) value = value.slice(0, -1);
        const cells = [];
        let cell = '';
        let inCode = false;
        for (let cursor = 0; cursor < value.length; cursor += 1) {
            const character = value[cursor];
            if (character === '`' && !isEscaped(value, cursor)) inCode = !inCode;
            if (character === '|' && !inCode && !isEscaped(value, cursor)) {
                cells.push(cell.trim());
                cell = '';
            } else if (character === '\\' && value[cursor + 1] === '|') {
                cell += '|';
                cursor += 1;
            } else {
                cell += character;
            }
        }
        cells.push(cell.trim());
        return cells;
    }

    function tableAlignments(line) {
        const cells = splitTableRow(line);
        if (!cells.length || cells.some((cell) => !/^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))) return null;
        return cells.map((cell) => {
            const clean = cell.replace(/\s+/g, '');
            if (clean.startsWith(':') && clean.endsWith(':')) return 'center';
            if (clean.endsWith(':')) return 'right';
            return 'left';
        });
    }

    function isMarkdownBlockStart(lines, index) {
        const line = lines[index] || '';
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (/^(```|~~~)/.test(trimmed)) return true;
        if (/^#{1,6}\s+/.test(trimmed)) return true;
        if (/^>\s?/.test(trimmed)) return true;
        if (/^([-+*])\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) return true;
        if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed.replace(/\s+/g, ''))) return true;
        if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) return true;
        return Boolean(lines[index + 1] && line.includes('|') && tableAlignments(lines[index + 1]));
    }

    function tableNode(headerCells, alignments, rows) {
        const wrap = document.createElement('div');
        wrap.className = 'fulafu-study-ai-table-wrap';
        const table = document.createElement('table');
        const head = document.createElement('thead');
        const headRow = document.createElement('tr');
        headerCells.forEach((cell, index) => {
            const heading = document.createElement('th');
            heading.style.textAlign = alignments[index] || 'left';
            appendInlineMarkdown(heading, cell);
            headRow.append(heading);
        });
        head.append(headRow);
        table.append(head);
        if (rows.length) {
            const body = document.createElement('tbody');
            rows.forEach((cells) => {
                const row = document.createElement('tr');
                headerCells.forEach((unused, index) => {
                    const cell = document.createElement('td');
                    cell.style.textAlign = alignments[index] || 'left';
                    appendInlineMarkdown(cell, cells[index] || '');
                    row.append(cell);
                });
                body.append(row);
            });
            table.append(body);
        }
        wrap.append(table);
        return wrap;
    }

    function markdownFragment(markdown) {
        const fragment = document.createDocumentFragment();
        const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
        let index = 0;

        while (index < lines.length) {
            const line = lines[index];
            const trimmed = line.trim();
            if (!trimmed) {
                index += 1;
                continue;
            }

            const fenceMatch = trimmed.match(/^(`{3,}|~{3,})\s*([\w.+-]*)\s*$/);
            if (fenceMatch) {
                const fence = fenceMatch[1];
                const language = fenceMatch[2];
                const codeLines = [];
                index += 1;
                while (index < lines.length && !lines[index].trim().startsWith(fence)) {
                    codeLines.push(lines[index]);
                    index += 1;
                }
                if (index < lines.length) index += 1;
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                if (language) code.className = `language-${language.replace(/[^\w-]/g, '')}`;
                code.textContent = codeLines.join('\n');
                pre.append(code);
                fragment.append(pre);
                continue;
            }

            if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
                const opener = trimmed.startsWith('$$') ? '$$' : '\\[';
                const closer = opener === '$$' ? '$$' : '\\]';
                let content = trimmed.slice(opener.length);
                const sameLineClosing = content.lastIndexOf(closer);
                if (sameLineClosing !== -1) {
                    content = content.slice(0, sameLineClosing);
                    index += 1;
                } else {
                    const formulaLines = content ? [content] : [];
                    index += 1;
                    while (index < lines.length) {
                        const closingIndex = lines[index].lastIndexOf(closer);
                        if (closingIndex !== -1) {
                            formulaLines.push(lines[index].slice(0, closingIndex));
                            index += 1;
                            break;
                        }
                        formulaLines.push(lines[index]);
                        index += 1;
                    }
                    content = formulaLines.join('\n');
                }
                fragment.append(mathNode(content.trim(), true));
                continue;
            }

            const headingMatch = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
            if (headingMatch) {
                const heading = document.createElement(`h${headingMatch[1].length}`);
                appendInlineMarkdown(heading, headingMatch[2]);
                fragment.append(heading);
                index += 1;
                continue;
            }

            if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed.replace(/\s+/g, ''))) {
                fragment.append(document.createElement('hr'));
                index += 1;
                continue;
            }

            const alignments = lines[index + 1] ? tableAlignments(lines[index + 1]) : null;
            if (line.includes('|') && alignments) {
                const headerCells = splitTableRow(line);
                const rows = [];
                index += 2;
                while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
                    rows.push(splitTableRow(lines[index]));
                    index += 1;
                }
                fragment.append(tableNode(headerCells, alignments, rows));
                continue;
            }

            if (/^>\s?/.test(trimmed)) {
                const quoteLines = [];
                while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
                    quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
                    index += 1;
                }
                const quote = document.createElement('blockquote');
                quote.append(markdownFragment(quoteLines.join('\n')));
                fragment.append(quote);
                continue;
            }

            const unorderedMatch = trimmed.match(/^[-+*]\s+(.+)$/);
            const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
            if (unorderedMatch || orderedMatch) {
                const ordered = Boolean(orderedMatch);
                const list = document.createElement(ordered ? 'ol' : 'ul');
                while (index < lines.length) {
                    const itemLine = lines[index].trim();
                    const itemMatch = ordered ? itemLine.match(/^\d+[.)]\s+(.+)$/) : itemLine.match(/^[-+*]\s+(.+)$/);
                    if (!itemMatch) break;
                    const item = document.createElement('li');
                    appendInlineMarkdown(item, itemMatch[1]);
                    list.append(item);
                    index += 1;
                }
                fragment.append(list);
                continue;
            }

            const paragraphLines = [];
            while (index < lines.length && lines[index].trim() && (paragraphLines.length === 0 || !isMarkdownBlockStart(lines, index))) {
                paragraphLines.push(lines[index].trim());
                index += 1;
            }
            if (!paragraphLines.length) {
                paragraphLines.push(trimmed);
                index += 1;
            }
            const paragraph = document.createElement('p');
            const content = paragraphLines.map((part, partIndex) => {
                if (partIndex === paragraphLines.length - 1) return part;
                return part.endsWith('  ') ? `${part.trimEnd()}\n` : `${part} `;
            }).join('');
            appendInlineMarkdown(paragraph, content);
            fragment.append(paragraph);
        }

        return fragment;
    }

    function renderAssistantMessage(message, markdown) {
        const state = assistantRenderStates.get(message);
        if (state?.frame) window.cancelAnimationFrame(state.frame);
        assistantRenderStates.delete(message);
        message.replaceChildren(markdownFragment(markdown));
    }

    function scheduleAssistantMessageRender(message, markdown) {
        const state = assistantRenderStates.get(message) || { frame: 0, markdown: '' };
        state.markdown = markdown;
        if (!state.frame) {
            state.frame = window.requestAnimationFrame(() => {
                const latest = assistantRenderStates.get(message);
                if (!latest) return;
                latest.frame = 0;
                message.replaceChildren(markdownFragment(latest.markdown));
            });
        }
        assistantRenderStates.set(message, state);
    }

    function cancelAssistantMessageRender(message) {
        const state = assistantRenderStates.get(message);
        if (state?.frame) window.cancelAnimationFrame(state.frame);
        assistantRenderStates.delete(message);
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
        const reasoningEffort = config.reasoningEffort !== 'default' ? config.reasoningEffort : '';
        if (isResponsesEndpoint(config.endpoint)) {
            const payload = {
                model: config.model,
                instructions: buildInstructions(),
                input: sessionHistory,
                max_output_tokens: 1600,
                store: false,
                stream: true
            };
            if (reasoningEffort) payload.reasoning = { effort: reasoningEffort };
            return payload;
        }
        const payload = {
            model: config.model,
            messages: [
                { role: 'system', content: buildInstructions() },
                ...sessionHistory
            ],
            max_tokens: 1600,
            stream: true
        };
        if (reasoningEffort) payload.reasoning_effort = reasoningEffort;
        return payload;
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
                scheduleAssistantMessageRender(assistantMessage, partialAnswer);
                elements.conversation.scrollTop = elements.conversation.scrollHeight;
            });
            requestForTurn = activeRequest;
            const answer = await requestPromise;
            if (revision !== contextRevision) return;
            renderAssistantMessage(assistantMessage, answer);
            history.push({ role: 'assistant', content: answer });
            setStatus(elements.requestStatus);
        } catch (error) {
            const entryIndex = history.indexOf(userEntry);
            if (entryIndex !== -1) history.splice(entryIndex, 1);
            userMessage.remove();
            cancelAssistantMessageRender(assistantMessage);
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
        if (elements.root.dataset.focusMode === 'true') setFocusMode(false);
        else closePanel();
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
