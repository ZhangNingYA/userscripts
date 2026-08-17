// ==UserScript==
// @name         ChatGPT Focus
// @name:zh-CN   ChatGPT 专注模式
// @name:en      ChatGPT Focus
// @namespace    https://scripts.fulafu.com/
// @version      1.6.0
// @description  A text-first ChatGPT reading layout with recent chats, mobile navigation, reading controls, and sensible model defaults.
// @description:zh-CN 为 ChatGPT 提供最近对话、移动导航、正文阅读排版和字号控制，同时保留模型、附件与下载功能。
// @description:en A text-first ChatGPT reading layout with recent chats, mobile navigation, reading controls, and sensible model defaults.
// @author       ZhangNingYA
// @homepageURL  https://scripts.fulafu.com/scripts/chatgpt-focus/
// @supportURL   https://github.com/ZhangNingYA/userscripts/issues
// @updateURL    https://scripts.fulafu.com/scripts/chatgpt-focus/chatgpt-focus.user.js
// @downloadURL  https://scripts.fulafu.com/scripts/chatgpt-focus/chatgpt-focus.user.js
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_VERSION = '1.6.0';
    const SCRIPT_RELEASED_AT = '2026-08-17 14:43:24 UTC+8';
    const SIDEBAR_ID = 'cgpt-focus-sidebar';
    const MOBILE_TOGGLE_ID = 'cgpt-focus-mobile-toggle';
    const BACKDROP_ID = 'cgpt-focus-backdrop';
    const CACHE_KEY = 'cgpt-focus-recent-v2';
    const LEGACY_CACHE_KEY = 'cgpt-focus-recent-v1';
    const COLLAPSE_KEY = 'cgpt-focus-sidebar-collapsed-v1';
    const FONT_SIZE_KEY = 'cgpt-focus-reading-font-size-v1';
    const MOBILE_QUERY = '(max-width: 700px)';
    const mobileMedia = window.matchMedia(MOBILE_QUERY);
    const MAX_RECENT = 5;
    const RECENT_REFRESH_MS = 60 * 1000;
    const DEFAULT_FONT_SIZE = 17;
    const MIN_FONT_SIZE = 15;
    const MAX_FONT_SIZE = 20;
    const CHAT_PATH_RE = /(?:^|\/)c\/[A-Za-z0-9_-]+\/?$/;
    const CHAT_ROUTE_RE = /^\/$|^\/c\/|^\/g\/[^/]+\/c\//;
    const WORK_LABEL_RE = /^(?:work|chatgpt work|工作|工作模式|工作区|开始工作)[？?。！!]?$/i;
    const CHAT_INTERFACE_RE = /^(?:(?:select|choose) chat (?:interface|mode)|选择聊天(?:界面|模式)|聊天界面选择)[？?。！!]?$/i;
    const PRUNED_CONTROL_RE = /^(?:try (?:a )?(?:new|different|another) prompt|试试(?:新的?|其他)提示|尝试(?:新的?|其他)提示|start (?:a )?(?:new )?voice (?:chat|mode)|voice input|dictate|开始(?:新的?)?语音(?:聊天|模式|功能)?|启动语音(?:聊天|模式|功能)?|语音输入|语言输入|启动语言功能)$/i;
    const HOME_HEADING_RE = /^(?:what can i help with|how can i help(?: you)?|有什么可以帮(?:到)?你(?:吗)?|我能帮你做什么|今天有什么可以帮(?:到)?你(?:吗)?|欢迎使用 chatgpt|work|工作|工作模式|工作区|try (?:one of )?these prompts|try (?:a )?(?:new|different|another) prompt|试试这些提示|试试新提示|开始工作)[？?。！!]?$/i;
    const CORE_COMPOSER_CONTROL_RE = /send|submit|stop|cancel|attach|upload|file|tool|model|remove|delete|发送|提交|停止|取消|附件|上传|文件|工具|模型|移除|删除/i;
    const DEFAULT_MODEL_RE = /gpt[\s-]*5\.6[\s-]*sol/i;
    const DEFAULT_MODEL_EXACT_RE = /^gpt[\s-]*5\.6[\s-]*sol$/i;
    const ADVANCED_OPTIONS_RE = /^(?:show\s+advanced\s+options|advanced\s+options|显示\s*高级\s*选项)$/i;
    const MODEL_ROW_RE = /^(?:model|模型)(?:\s|$)/i;
    const REASONING_ROW_RE = /^(?:reasoning effort|reasoning intensity|推理强度|思考强度)(?:\s|$)/i;
    const HIGH_REASONING_RE = /^(?:high|高)$/i;

    const css = String.raw`
        :root {
            --cgpt-focus-sidebar-expanded: 232px;
            --cgpt-focus-sidebar-collapsed: 56px;
            --cgpt-focus-sidebar-width: var(--cgpt-focus-sidebar-expanded);
            --cgpt-focus-reading-font-size: 17px;
            --cgpt-focus-reading-line-height: 1.78;
            --cgpt-focus-reading-measure: 72ch;
        }

        html.cgpt-focus-collapsed {
            --cgpt-focus-sidebar-width: var(--cgpt-focus-sidebar-collapsed);
        }

        html.cgpt-focus-active {
            --sidebar-width: 0px !important;
        }

        html.cgpt-focus-active,
        html.cgpt-focus-active body {
            overflow-x: hidden !important;
        }

        #${MOBILE_TOGGLE_ID},
        #${BACKDROP_ID} {
            display: none;
        }

        html.cgpt-focus-active .cgpt-focus-app-root {
            box-sizing: border-box !important;
            width: calc(100vw - var(--cgpt-focus-sidebar-width)) !important;
            max-width: calc(100vw - var(--cgpt-focus-sidebar-width)) !important;
            margin-left: var(--cgpt-focus-sidebar-width) !important;
            transition: width 160ms ease, max-width 160ms ease, margin-left 160ms ease;
        }

        html.cgpt-focus-active #stage-slideover-sidebar,
        html.cgpt-focus-active [data-testid="sidebar"],
        html.cgpt-focus-active [data-testid="navigation-sidebar"],
        html.cgpt-focus-active .cgpt-focus-native-sidebar,
        html.cgpt-focus-active .cgpt-focus-native-sidebar-control {
            display: none !important;
        }

        html.cgpt-focus-active .cgpt-focus-pruned,
        html.cgpt-focus-home .cgpt-focus-home-pruned,
        html.cgpt-focus-active [data-testid="composer-speech-button"],
        html.cgpt-focus-active [data-testid="composer-dictate-button"],
        html.cgpt-focus-active [data-testid*="voice-mode" i],
        html.cgpt-focus-active [data-testid*="voice-input" i],
        html.cgpt-focus-active [data-testid*="prompt-starter" i],
        html.cgpt-focus-active [data-testid*="starter-prompt" i],
        html.cgpt-focus-active [data-testid*="suggested-prompt" i],
        html.cgpt-focus-active button[aria-label*="voice" i]:not([data-testid*="model" i]),
        html.cgpt-focus-active button[aria-label*="dictat" i],
        html.cgpt-focus-active button[aria-label*="语音" i],
        html.cgpt-focus-active button[aria-label*="听写" i],
        html.cgpt-focus-active button[title*="voice" i]:not([data-testid*="model" i]),
        html.cgpt-focus-active button[title*="语音" i],
        html.cgpt-focus-active button[title*="听写" i],
        html.cgpt-focus-active [role="button"][aria-label*="voice" i],
        html.cgpt-focus-active [role="button"][aria-label*="语音" i],
        html.cgpt-focus-active [role="button"][aria-label*="听写" i] {
            display: none !important;
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] .markdown,
        html.cgpt-focus-active [data-message-author-role="assistant"] .prose {
            width: 100%;
            max-width: var(--cgpt-focus-reading-measure);
            margin-inline: auto;
            font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
            font-size: var(--cgpt-focus-reading-font-size) !important;
            line-height: var(--cgpt-focus-reading-line-height) !important;
            letter-spacing: 0 !important;
            overflow-wrap: anywhere;
            text-wrap: pretty;
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] .markdown p,
        html.cgpt-focus-active [data-message-author-role="assistant"] .prose p {
            margin-block: 0 1em;
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] .markdown p:last-child,
        html.cgpt-focus-active [data-message-author-role="assistant"] .prose p:last-child {
            margin-bottom: 0;
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] :is(.markdown, .prose) > :first-child {
            margin-top: 0 !important;
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] :is(.markdown, .prose) > :last-child {
            margin-bottom: 0 !important;
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] .markdown h1,
        html.cgpt-focus-active [data-message-author-role="assistant"] .markdown h2,
        html.cgpt-focus-active [data-message-author-role="assistant"] .markdown h3,
        html.cgpt-focus-active [data-message-author-role="assistant"] .prose h1,
        html.cgpt-focus-active [data-message-author-role="assistant"] .prose h2,
        html.cgpt-focus-active [data-message-author-role="assistant"] .prose h3 {
            margin-block: 1.55em .65em;
            line-height: 1.35 !important;
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] .markdown ul,
        html.cgpt-focus-active [data-message-author-role="assistant"] .markdown ol,
        html.cgpt-focus-active [data-message-author-role="assistant"] .prose ul,
        html.cgpt-focus-active [data-message-author-role="assistant"] .prose ol {
            margin-block: .7em 1em;
            padding-inline-start: 1.45em;
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] .markdown li,
        html.cgpt-focus-active [data-message-author-role="assistant"] .prose li {
            margin-block: .32em;
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] .markdown blockquote,
        html.cgpt-focus-active [data-message-author-role="assistant"] .prose blockquote {
            margin: 1.1em 0;
            padding: .15em 0 .15em 1em;
            color: var(--text-secondary, #5f6368);
            border-left: 2px solid var(--border-medium, rgba(0, 0, 0, .24));
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] .markdown a,
        html.cgpt-focus-active [data-message-author-role="assistant"] .prose a {
            text-decoration-thickness: 1px;
            text-underline-offset: .18em;
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] :is(.markdown, .prose) :is(pre, table) {
            max-width: 100%;
            font-size: .88em;
            line-height: 1.58;
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] :is(.markdown, .prose) table {
            display: block;
            overflow-x: auto;
        }

        html.cgpt-focus-active [data-message-author-role="assistant"] :is(.markdown, .prose) :not(pre) > code {
            font-size: .9em;
        }

        #${SIDEBAR_ID} {
            position: fixed;
            inset: 0 auto 0 0;
            z-index: 2147483646;
            box-sizing: border-box;
            display: flex;
            width: var(--cgpt-focus-sidebar-width);
            flex-direction: column;
            gap: 8px;
            padding: 10px;
            overflow: hidden;
            color: var(--text-primary, #202123);
            background: var(--sidebar-surface-primary, var(--token-sidebar-surface-primary, #f7f7f8));
            border-right: 1px solid var(--border-light, rgba(0, 0, 0, 0.10));
            font: 14px/1.35 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            letter-spacing: 0;
            transition: width 160ms ease, padding 160ms ease;
            contain: layout paint style;
        }

        #${SIDEBAR_ID}[hidden] {
            display: none !important;
        }

        #${SIDEBAR_ID} *,
        #${SIDEBAR_ID} *::before,
        #${SIDEBAR_ID} *::after {
            box-sizing: border-box;
        }

        #${SIDEBAR_ID} button {
            color: inherit;
            font: inherit;
            letter-spacing: 0;
        }

        #${SIDEBAR_ID} .cgpt-focus-toolbar {
            display: flex;
            min-height: 40px;
            flex: 0 0 40px;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }

        #${SIDEBAR_ID} .cgpt-focus-title {
            min-width: 0;
            padding-left: 10px;
            overflow: hidden;
            font-size: 12px;
            font-weight: 700;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${SIDEBAR_ID} .cgpt-focus-toggle {
            display: grid;
            width: 40px;
            height: 40px;
            flex: 0 0 40px;
            place-items: center;
            padding: 0;
            color: inherit;
            background: transparent;
            border: 0;
            border-radius: 6px;
            cursor: pointer;
            font-size: 25px;
            font-weight: 300;
            line-height: 1;
        }

        #${SIDEBAR_ID} .cgpt-focus-new {
            display: flex;
            height: 42px;
            min-height: 42px;
            width: 100%;
            flex: 0 0 42px;
            align-items: center;
            gap: 9px;
            padding: 0 11px;
            background: transparent;
            border: 1px solid var(--border-medium, rgba(0, 0, 0, 0.16));
            border-radius: 7px;
            cursor: pointer;
            font-weight: 600;
            text-align: left;
            white-space: nowrap;
        }

        #${SIDEBAR_ID} .cgpt-focus-toggle:hover,
        #${SIDEBAR_ID} .cgpt-focus-new:hover,
        #${SIDEBAR_ID} .cgpt-focus-chat:hover {
            background: var(--sidebar-surface-secondary, var(--token-sidebar-surface-secondary, rgba(0, 0, 0, 0.06)));
        }

        #${SIDEBAR_ID} .cgpt-focus-plus {
            width: 20px;
            flex: 0 0 20px;
            font-size: 21px;
            font-weight: 300;
            line-height: 18px;
            text-align: center;
        }

        #${SIDEBAR_ID} .cgpt-focus-reading-controls {
            display: flex;
            min-height: 38px;
            flex: 0 0 auto;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 0 2px 2px 10px;
        }

        #${SIDEBAR_ID} .cgpt-focus-reading-label {
            min-width: 0;
            overflow: hidden;
            color: var(--text-secondary, rgba(32, 33, 35, .68));
            font-size: 11px;
            font-weight: 600;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${SIDEBAR_ID} .cgpt-focus-stepper {
            display: grid;
            grid-template-columns: 34px 30px 34px;
            align-items: center;
            overflow: hidden;
            border: 1px solid var(--border-medium, rgba(0, 0, 0, .15));
            border-radius: 6px;
        }

        #${SIDEBAR_ID} .cgpt-focus-font-button {
            display: grid;
            width: 34px;
            height: 34px;
            place-items: center;
            padding: 0;
            background: transparent;
            border: 0;
            cursor: pointer;
            font-size: 12px;
            font-weight: 650;
            line-height: 1;
        }

        #${SIDEBAR_ID} .cgpt-focus-font-button:hover:not(:disabled) {
            background: var(--sidebar-surface-secondary, var(--token-sidebar-surface-secondary, rgba(0, 0, 0, .06)));
        }

        #${SIDEBAR_ID} .cgpt-focus-font-button:disabled {
            cursor: default;
            opacity: .36;
        }

        #${SIDEBAR_ID} .cgpt-focus-font-size {
            font-size: 10px;
            font-variant-numeric: tabular-nums;
            text-align: center;
        }

        #${SIDEBAR_ID} .cgpt-focus-list {
            display: flex;
            min-height: 0;
            flex: 1 1 auto;
            flex-direction: column;
            gap: 2px;
            padding-top: 2px;
            overflow: hidden;
        }

        #${SIDEBAR_ID} .cgpt-focus-footer {
            display: flex;
            min-width: 0;
            flex: 0 0 auto;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 9px 10px 2px;
            color: var(--text-secondary, rgba(32, 33, 35, 0.58));
            border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.10));
            font-size: 10px;
            white-space: nowrap;
        }

        #${SIDEBAR_ID} .cgpt-focus-release {
            overflow: hidden;
            text-overflow: ellipsis;
        }

        #${SIDEBAR_ID} .cgpt-focus-chat {
            display: block;
            min-height: 38px;
            padding: 9px 10px;
            overflow: hidden;
            color: inherit;
            border-radius: 6px;
            text-decoration: none;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${SIDEBAR_ID} .cgpt-focus-chat[aria-current="page"] {
            background: var(--sidebar-surface-secondary, var(--token-sidebar-surface-secondary, rgba(0, 0, 0, 0.08)));
            font-weight: 600;
        }

        #${SIDEBAR_ID} .cgpt-focus-recent-status {
            padding: 12px 10px;
            color: var(--text-secondary, rgba(32, 33, 35, .58));
            font-size: 11px;
            line-height: 1.5;
        }

        #${SIDEBAR_ID} button:focus-visible,
        #${SIDEBAR_ID} a:focus-visible {
            outline: 2px solid var(--text-primary, #202123);
            outline-offset: 2px;
        }

        html.cgpt-focus-collapsed #${SIDEBAR_ID} {
            padding-inline: 8px;
        }

        html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-toolbar {
            justify-content: center;
        }

        html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-new {
            width: 40px;
            min-width: 40px;
            align-self: center;
            justify-content: center;
            padding: 0;
        }

        html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-new-label,
        html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-list,
        html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-title,
        html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-reading-controls,
        html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-footer {
            display: none;
        }

        @media (prefers-color-scheme: dark) {
            #${SIDEBAR_ID} {
                color: var(--text-primary, #ececf1);
                background: var(--sidebar-surface-primary, var(--token-sidebar-surface-primary, #171717));
                border-right-color: var(--border-light, rgba(255, 255, 255, 0.12));
            }

            #${SIDEBAR_ID} .cgpt-focus-footer {
                color: var(--text-secondary, rgba(236, 236, 241, 0.58));
                border-top-color: var(--border-light, rgba(255, 255, 255, 0.12));
            }

            #${SIDEBAR_ID} .cgpt-focus-reading-label {
                color: var(--text-secondary, rgba(236, 236, 241, .68));
            }

            #${SIDEBAR_ID} .cgpt-focus-recent-status {
                color: var(--text-secondary, rgba(236, 236, 241, .58));
            }
        }

        @media (max-width: 700px) {
            :root {
                --cgpt-focus-sidebar-expanded: min(86vw, 310px);
                --cgpt-focus-sidebar-collapsed: 0px;
                --cgpt-focus-reading-line-height: 1.74;
                --cgpt-focus-reading-measure: 100%;
            }

            html.cgpt-focus-active .cgpt-focus-app-root,
            html.cgpt-focus-active:not(.cgpt-focus-collapsed) .cgpt-focus-app-root {
                width: 100vw !important;
                max-width: 100vw !important;
                margin-left: 0 !important;
            }

            html.cgpt-focus-active #page-header [data-testid="model-switcher-dropdown-button"] {
                margin-left: 48px !important;
            }

            #${SIDEBAR_ID} {
                inset: 0 auto 0 0;
                width: var(--cgpt-focus-sidebar-expanded);
                max-width: calc(100vw - 46px);
                padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom));
                font-size: 14px;
                box-shadow: 12px 0 34px rgba(0, 0, 0, 0.20);
                transform: translateX(0);
                transition: transform 180ms ease, visibility 180ms ease;
                visibility: visible;
            }

            html.cgpt-focus-collapsed #${SIDEBAR_ID} {
                width: var(--cgpt-focus-sidebar-expanded);
                padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom));
                pointer-events: none;
                transform: translateX(-105%);
                visibility: hidden;
            }

            #${SIDEBAR_ID} .cgpt-focus-toggle,
            #${SIDEBAR_ID} .cgpt-focus-new,
            #${SIDEBAR_ID} .cgpt-focus-font-button {
                min-height: 44px;
            }

            #${SIDEBAR_ID} .cgpt-focus-reading-controls {
                min-height: 46px;
            }

            #${SIDEBAR_ID} .cgpt-focus-stepper {
                grid-template-columns: 44px 34px 44px;
            }

            #${SIDEBAR_ID} .cgpt-focus-font-button {
                width: 44px;
                height: 44px;
            }

            #${SIDEBAR_ID} .cgpt-focus-chat {
                min-height: 44px;
                padding-top: 12px;
                padding-bottom: 12px;
            }

            #${MOBILE_TOGGLE_ID} {
                position: fixed;
                top: max(8px, env(safe-area-inset-top));
                left: max(8px, env(safe-area-inset-left));
                z-index: 2147483645;
                width: 44px;
                height: 44px;
                place-items: center;
                padding: 0;
                color: var(--text-primary, #202123);
                background: var(--main-surface-primary, rgba(255, 255, 255, 0.96));
                border: 1px solid var(--border-light, rgba(0, 0, 0, 0.12));
                border-radius: 8px;
                box-shadow: 0 3px 12px rgba(0, 0, 0, 0.10);
                cursor: pointer;
                font: 22px/1 ui-sans-serif, system-ui, sans-serif;
                touch-action: manipulation;
                transition: opacity 140ms ease, transform 140ms ease;
            }

            html.cgpt-focus-active #${MOBILE_TOGGLE_ID}:not([hidden]) {
                display: grid;
            }

            html.cgpt-focus-active:not(.cgpt-focus-collapsed) #${MOBILE_TOGGLE_ID} {
                opacity: 0;
                pointer-events: none;
                transform: scale(.92);
            }

            #${BACKDROP_ID} {
                position: fixed;
                inset: 0;
                z-index: 2147483644;
                width: 100%;
                height: 100%;
                padding: 0;
                background: rgba(0, 0, 0, 0.34);
                border: 0;
                cursor: default;
                opacity: 1;
                touch-action: manipulation;
                transition: opacity 180ms ease;
            }

            html.cgpt-focus-active #${BACKDROP_ID}:not([hidden]) {
                display: block;
            }

            #${MOBILE_TOGGLE_ID}:focus-visible,
            #${BACKDROP_ID}:focus-visible {
                outline: 2px solid var(--text-primary, #202123);
                outline-offset: 2px;
            }

            html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-title,
            html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-new-label,
            html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-list,
            html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-reading-controls,
            html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-footer {
                display: flex;
            }

            html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-title {
                display: block;
            }

            html.cgpt-focus-collapsed #${SIDEBAR_ID} .cgpt-focus-new {
                width: 100%;
                min-width: 0;
                align-self: stretch;
                justify-content: flex-start;
                padding: 0 11px;
            }

        }

        @media (max-width: 700px) and (prefers-color-scheme: dark) {
            #${MOBILE_TOGGLE_ID} {
                color: var(--text-primary, #ececf1);
                background: var(--main-surface-primary, rgba(23, 23, 23, 0.96));
                border-color: var(--border-light, rgba(255, 255, 255, 0.14));
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #${SIDEBAR_ID},
            #${MOBILE_TOGGLE_ID},
            #${BACKDROP_ID},
            html.cgpt-focus-active .cgpt-focus-app-root {
                transition: none;
            }
        }
    `;

    if (typeof GM_addStyle === 'function') {
        GM_addStyle(css);
    } else {
        const style = document.createElement('style');
        style.textContent = css;
        document.documentElement.appendChild(style);
    }

    function isMobileViewport() {
        return mobileMedia.matches;
    }

    function readCollapsedState() {
        if (isMobileViewport()) {
            return true;
        }
        try {
            const stored = localStorage.getItem(COLLAPSE_KEY);
            if (stored !== null) {
                return stored === '1';
            }
        } catch {
            // Fall through to the expanded desktop default.
        }
        return false;
    }

    function readFontSize() {
        try {
            const stored = Number.parseInt(localStorage.getItem(FONT_SIZE_KEY) || '', 10);
            if (Number.isFinite(stored)) {
                return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, stored));
            }
        } catch {
            // Fall through to the reading-friendly default.
        }
        return DEFAULT_FONT_SIZE;
    }

    let currentFontSize = DEFAULT_FONT_SIZE;

    function setFontSize(size, persist = true) {
        const nextSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Number(size) || DEFAULT_FONT_SIZE));
        currentFontSize = nextSize;
        document.documentElement.style.setProperty('--cgpt-focus-reading-font-size', `${nextSize}px`);

        const output = document.querySelector(`#${SIDEBAR_ID} .cgpt-focus-font-size`);
        if (output) {
            output.textContent = String(nextSize);
            output.setAttribute('aria-label', `正文字号 ${nextSize} 像素`);
        }

        const decrease = document.querySelector(`#${SIDEBAR_ID} [data-font-action="decrease"]`);
        const increase = document.querySelector(`#${SIDEBAR_ID} [data-font-action="increase"]`);
        if (decrease) {
            decrease.disabled = nextSize <= MIN_FONT_SIZE;
        }
        if (increase) {
            increase.disabled = nextSize >= MAX_FONT_SIZE;
        }

        if (persist) {
            try {
                localStorage.setItem(FONT_SIZE_KEY, String(nextSize));
            } catch {
                // The control still works for this page when storage is unavailable.
            }
        }
        return nextSize;
    }

    function setSidebarCollapsed(collapsed, persist = true) {
        const mobile = isMobileViewport();
        const root = document.documentElement;
        root.classList.toggle('cgpt-focus-collapsed', collapsed);
        root.classList.toggle('cgpt-focus-mobile-open', mobile && !collapsed);

        const toggle = document.querySelector(`#${SIDEBAR_ID} .cgpt-focus-toggle`);
        if (toggle) {
            toggle.textContent = mobile ? '×' : (collapsed ? '›' : '‹');
            toggle.setAttribute('aria-expanded', String(!collapsed));
            toggle.setAttribute('aria-label', collapsed ? '展开专注导航' : '收起专注导航');
            toggle.title = collapsed ? '展开专注导航' : '收起专注导航';
        }

        const mobileToggle = document.getElementById(MOBILE_TOGGLE_ID);
        if (mobileToggle) {
            mobileToggle.setAttribute('aria-expanded', String(!collapsed));
        }

        const sidebar = document.getElementById(SIDEBAR_ID);
        if (sidebar) {
            sidebar.toggleAttribute('inert', mobile && collapsed);
            sidebar.setAttribute('aria-hidden', String(mobile && collapsed));
        }

        const backdrop = document.getElementById(BACKDROP_ID);
        if (backdrop) {
            backdrop.hidden = !root.classList.contains('cgpt-focus-active') || collapsed;
        }

        if (persist && !mobile) {
            try {
                localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
            } catch {
                // Collapsing still works when site storage is unavailable.
            }
        }
    }

    function openMobileSidebar() {
        if (!isMobileViewport()) {
            return;
        }
        setSidebarCollapsed(false, false);
        window.requestAnimationFrame(() => {
            document.querySelector(`#${SIDEBAR_ID} .cgpt-focus-toggle`)?.focus({ preventScroll: true });
        });
    }

    function closeMobileSidebar(restoreFocus = false) {
        if (!isMobileViewport()) {
            return;
        }
        setSidebarCollapsed(true, false);
        if (restoreFocus) {
            document.getElementById(MOBILE_TOGGLE_ID)?.focus({ preventScroll: true });
        }
    }

    function applyInitialCollapsedState() {
        if (!document.documentElement) {
            return false;
        }
        setSidebarCollapsed(readCollapsedState(), false);
        setFontSize(readFontSize(), false);
        return true;
    }

    if (!applyInitialCollapsedState()) {
        document.addEventListener('DOMContentLoaded', applyInitialCollapsedState, { once: true });
    }

    function isChatRoute(pathname = location.pathname) {
        return CHAT_ROUTE_RE.test(pathname);
    }

    function normalizePath(href) {
        try {
            const url = new URL(href, location.origin);
            if (url.origin !== location.origin || !CHAT_PATH_RE.test(url.pathname)) {
                return null;
            }
            return url.pathname;
        } catch {
            return null;
        }
    }

    function cleanTitle(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .replace(/\s*[|\-–]\s*ChatGPT\s*$/i, '')
            .trim()
            .slice(0, 100);
    }

    function getControlValues(control) {
        return [
            control.innerText || control.textContent,
            control.getAttribute('aria-label'),
            control.getAttribute('title'),
            control.getAttribute('data-testid'),
            control.id
        ].map(cleanTitle).filter(Boolean);
    }

    function isCoreComposerControl(control, composer) {
        if (composer && composer.contains(control)) {
            return true;
        }

        const identity = [
            control.id,
            control.getAttribute('data-testid'),
            control.getAttribute('aria-label'),
            control.getAttribute('title')
        ].filter(Boolean).join(' ');

        return CORE_COMPOSER_CONTROL_RE.test(identity);
    }

    function findComposer() {
        const input = document.querySelector('#prompt-textarea, textarea[data-id="root"], textarea[placeholder]');
        if (!input) {
            return null;
        }

        return input.closest('[class~="group/composer"]')
            || input.closest('form')
            || input.closest('[data-type="unified-composer"]')
            || input.closest('[data-testid*="composer"]')
            || input.parentElement;
    }

    function removeWorkUi() {
        const pageHeader = document.querySelector('#page-header');
        if (pageHeader) {
            for (const candidate of pageHeader.querySelectorAll('[aria-label], [role="radiogroup"], [role="group"]')) {
                if (getControlValues(candidate).some((value) => CHAT_INTERFACE_RE.test(value))) {
                    candidate.remove();
                }
            }
        }

        const candidates = document.querySelectorAll([
            '#page-header button',
            '#page-header a',
            '#page-header [role="button"]',
            '#page-header [role="radio"]',
            '#page-header [role="tab"]',
            '#page-header [data-testid]',
            'header button',
            'header a',
            'header [role="button"]',
            'header [role="radio"]',
            'header [role="tab"]',
            'header [data-testid]',
            'main button',
            'main a[role="button"]',
            'main [role="button"]',
            'main [role="radio"]',
            'main [role="tab"]',
            'main [data-testid]'
        ].join(','));

        for (const candidate of candidates) {
            if (!candidate.isConnected || candidate.closest(`#${SIDEBAR_ID}, article, [data-message-author-role]`)) {
                continue;
            }

            const values = getControlValues(candidate);
            const identity = values.join(' ');
            const isWorkControl = values.some((value) => WORK_LABEL_RE.test(value))
                || /(?:^|[-_])(?:work|work-mode|composer-work|work-button)(?:$|[-_])/i.test(identity);
            if (!isWorkControl) {
                continue;
            }

            if (!candidate.matches('button, a, [role="button"], [role="tab"]')
                && candidate.querySelector('#prompt-textarea, textarea, [data-testid*="model" i]')) {
                continue;
            }

            let target = candidate.closest('button, a, [role="button"], [role="radio"], [role="tab"]') || candidate;
            const interfaceRoot = target.closest('[role="radiogroup"], [aria-label]');
            if (interfaceRoot
                && interfaceRoot.closest('#page-header, header')
                && (getControlValues(interfaceRoot).some((value) => CHAT_INTERFACE_RE.test(value))
                    || Array.from(interfaceRoot.querySelectorAll('[role="radio"]')).some((radio) =>
                        getControlValues(radio).some((value) => WORK_LABEL_RE.test(value))))) {
                interfaceRoot.remove();
                continue;
            }
            for (let depth = 0; target.parentElement && depth < 2; depth += 1) {
                const parent = target.parentElement;
                if (parent.matches('body, main, header, form')
                    || parent.querySelector('#prompt-textarea, textarea, [data-testid*="model" i]')
                    || !WORK_LABEL_RE.test(cleanTitle(parent.textContent))) {
                    break;
                }
                target = parent;
            }
            target.remove();
        }
    }

    function pruneNonChatControls() {
        document.querySelectorAll('.cgpt-focus-pruned').forEach((element) => {
            element.classList.remove('cgpt-focus-pruned');
        });

        document.querySelectorAll('header button, header a, main button, main a[role="button"], main [role="tab"]').forEach((control) => {
            if (control.closest(`#${SIDEBAR_ID}, article, [data-message-author-role]`)) {
                return;
            }

            const values = getControlValues(control);
            const identity = values.join(' ');
            const shouldPrune = values.some((value) => PRUNED_CONTROL_RE.test(value))
                || /(?:^|[-_])(?:prompt-starter|starter-prompt|suggested-prompt)(?:$|[-_])/i.test(identity);

            if (shouldPrune) {
                control.classList.add('cgpt-focus-pruned');
            }
        });
    }

    function pruneHome() {
        const main = document.querySelector('main');
        if (!main) {
            return;
        }

        main.querySelectorAll('.cgpt-focus-home-pruned').forEach((element) => {
            element.classList.remove('cgpt-focus-home-pruned');
        });

        const composer = findComposer();
        const prunedControls = [];
        main.querySelectorAll('button, [role="button"]').forEach((control) => {
            if (control.closest(`#${SIDEBAR_ID}, article, [data-message-author-role]`)
                || control.classList.contains('cgpt-focus-pruned')
                || isCoreComposerControl(control, composer)) {
                return;
            }

            control.classList.add('cgpt-focus-home-pruned');
            prunedControls.push(control);
        });

        main.querySelectorAll('h1, h2, h3, [role="heading"], p, span, div').forEach((element) => {
            if (element.closest(`#${SIDEBAR_ID}, form, article, [data-message-author-role]`)
                || element.childElementCount > 1) {
                return;
            }

            const text = cleanTitle(element.textContent);
            if (text && text.length <= 100 && HOME_HEADING_RE.test(text)) {
                element.classList.add('cgpt-focus-home-pruned');
            }
        });

        for (const control of prunedControls) {
            let group = control.parentElement;
            for (let depth = 0; group && group !== main && depth < 3; depth += 1, group = group.parentElement) {
                if (composer && group.contains(composer)) {
                    break;
                }

                const controls = Array.from(group.querySelectorAll('button, [role="button"]'));
                if (!controls.length || controls.some((item) => !item.classList.contains('cgpt-focus-home-pruned') && !item.classList.contains('cgpt-focus-pruned'))) {
                    break;
                }
                group.classList.add('cgpt-focus-home-pruned');
            }
        }
    }

    function isVisibleControl(element) {
        if (!element || !element.isConnected || element.closest(`#${SIDEBAR_ID}, article, [data-message-author-role]`)) {
            return false;
        }
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
            && style.visibility !== 'hidden'
            && rect.width > 0
            && rect.height > 0;
    }

    function findCapabilityTrigger() {
        const composer = findComposer();
        if (!composer) {
            return null;
        }

        const buttons = Array.from(composer.querySelectorAll('button'));
        return buttons.find((control) => isVisibleControl(control)
            && control.matches('[class~="__composer-pill"]'))
            || buttons.find((control) => isVisibleControl(control)
                && control.getAttribute('aria-haspopup') === 'menu'
                && getControlValues(control).some((value) =>
                    /^(?:fast|quick|medium|high|low|light|extra high|极速|中|高|低)$/i.test(value)))
            || null;
    }

    function getChoiceRoots() {
        return Array.from(document.querySelectorAll([
            '[role="menu"]',
            '[role="listbox"]',
            '[role="dialog"]',
            '[data-radix-popper-content-wrapper]',
            '[data-headlessui-portal]'
        ].join(','))).filter(isVisibleControl);
    }

    function findVisibleChoice(pattern, exclude) {
        const roots = getChoiceRoots();
        if (!roots.length) {
            return null;
        }

        const selector = [
            'button',
            '[role="menuitem"]',
            '[role="menuitemradio"]',
            '[role="option"]',
            '[role="radio"]',
            '[data-testid*="model" i]',
            '[data-testid*="reasoning" i]',
            '[data-testid*="effort" i]'
        ].join(',');

        for (const root of roots) {
            for (const control of root.querySelectorAll(selector)) {
                if (control !== exclude
                    && isVisibleControl(control)
                    && !control.matches('[disabled], [aria-disabled="true"]')
                    && getControlValues(control).some((value) => pattern.test(value))) {
                    return control;
                }
            }
        }
        return null;
    }

    async function waitForChoice(pattern, exclude, timeout = 1400) {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeout) {
            const choice = findVisibleChoice(pattern, exclude);
            if (choice) {
                return choice;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 70));
        }
        return null;
    }

    async function expandControl(control) {
        if (!control || !control.isConnected) {
            return;
        }

        control.focus({ preventScroll: true });
        if (typeof PointerEvent === 'function') {
            control.dispatchEvent(new PointerEvent('pointermove', {
                bubbles: true,
                cancelable: true,
                composed: true,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
            control.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                composed: true,
                button: 0,
                buttons: 1,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
            control.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                cancelable: true,
                composed: true,
                button: 0,
                buttons: 0,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
        }
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        if (control.getAttribute('aria-expanded') !== 'true') {
            control.click();
            await new Promise((resolve) => window.setTimeout(resolve, 80));
        }
    }

    function getAdvancedRows() {
        return {
            model: findVisibleChoice(MODEL_ROW_RE),
            reasoning: findVisibleChoice(REASONING_ROW_RE)
        };
    }

    function isDefaultModelRow(row) {
        return Boolean(row && getControlValues(row).some((value) => DEFAULT_MODEL_RE.test(value)));
    }

    function isHighReasoningRow(row) {
        return Boolean(row && getControlValues(row).some((value) =>
            REASONING_ROW_RE.test(value) && /(?:^|\s)(?:high|高)$/i.test(value)));
    }

    function isHighReasoningSelected() {
        const trigger = findCapabilityTrigger();
        if (trigger && getControlValues(trigger).some((value) => HIGH_REASONING_RE.test(value))) {
            return true;
        }
        return isHighReasoningRow(getAdvancedRows().reasoning);
    }

    async function closeModelMenu(trigger) {
        const active = document.activeElement;
        if (active) {
            active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        if (trigger && trigger.getAttribute('aria-expanded') === 'true') {
            trigger.click();
        }
    }

    function isCurrentModelSetup(generation) {
        return generation === modelSetupGeneration && location.pathname === '/';
    }

    async function openAdvancedSettings(generation) {
        if (!isCurrentModelSetup(generation)) {
            return null;
        }

        const trigger = findCapabilityTrigger();
        if (!trigger) {
            return null;
        }

        let rows = getAdvancedRows();
        if (!rows.model || !rows.reasoning) {
            await expandControl(trigger);
            rows = getAdvancedRows();
        }

        if (!rows.model || !rows.reasoning) {
            const advanced = await waitForChoice(ADVANCED_OPTIONS_RE, trigger, 900);
            if (!advanced || !isCurrentModelSetup(generation)) {
                await closeModelMenu(trigger);
                return null;
            }
            await expandControl(advanced);
            const startedAt = performance.now();
            while (performance.now() - startedAt < 1200 && isCurrentModelSetup(generation)) {
                rows = getAdvancedRows();
                if (rows.model && rows.reasoning) {
                    break;
                }
                await new Promise((resolve) => window.setTimeout(resolve, 70));
            }
        }

        return rows.model && rows.reasoning ? { trigger, ...rows } : null;
    }

    async function ensureDefaultModel(generation) {
        let settings = await openAdvancedSettings(generation);
        if (!settings || !isCurrentModelSetup(generation)) {
            return false;
        }

        if (!isDefaultModelRow(settings.model)) {
            await expandControl(settings.model);
            const modelChoice = await waitForChoice(DEFAULT_MODEL_EXACT_RE, settings.model);
            if (!modelChoice || !isCurrentModelSetup(generation)) {
                await closeModelMenu(settings.trigger);
                return false;
            }
            modelChoice.click();
            await new Promise((resolve) => window.setTimeout(resolve, 180));
            settings = await openAdvancedSettings(generation);
            if (!settings || !isDefaultModelRow(settings.model)) {
                return false;
            }
        }

        if (isHighReasoningSelected() || isHighReasoningRow(settings.reasoning)) {
            await closeModelMenu(settings.trigger);
            return true;
        }

        await expandControl(settings.reasoning);
        const highChoice = await waitForChoice(HIGH_REASONING_RE, settings.reasoning);
        if (!highChoice || !isCurrentModelSetup(generation)) {
            await closeModelMenu(settings.trigger);
            return false;
        }
        highChoice.click();

        const startedAt = performance.now();
        while (performance.now() - startedAt < 1200 && isCurrentModelSetup(generation)) {
            if (isHighReasoningSelected()) {
                await closeModelMenu(settings.trigger);
                return true;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 70));
        }
        await closeModelMenu(settings.trigger);
        return false;
    }

    let modelSetupTimer = 0;
    let modelSetupInFlight = false;
    let modelSetupAttempts = 0;
    let modelSetupDone = false;
    let modelSetupPath = location.pathname;
    let modelSetupGeneration = 0;

    function resetModelSetup(pathname) {
        window.clearTimeout(modelSetupTimer);
        modelSetupTimer = 0;
        modelSetupInFlight = false;
        modelSetupAttempts = 0;
        modelSetupDone = false;
        modelSetupPath = pathname;
        modelSetupGeneration += 1;
    }

    function scheduleModelSetup(delay = 350) {
        if (location.pathname !== '/'
            || modelSetupDone
            || modelSetupInFlight
            || modelSetupTimer
            || modelSetupAttempts >= 6) {
            return;
        }

        modelSetupTimer = window.setTimeout(async () => {
            modelSetupTimer = 0;
            modelSetupInFlight = true;
            modelSetupAttempts += 1;
            const generation = modelSetupGeneration;
            try {
                const completed = await ensureDefaultModel(generation);
                if (isCurrentModelSetup(generation)) {
                    modelSetupDone = completed;
                }
            } finally {
                modelSetupInFlight = false;
                if (!modelSetupDone && modelSetupAttempts < 6) {
                    scheduleModelSetup(650);
                }
            }
        }, delay);
    }

    function normalizeRecentItems(items) {
        if (!Array.isArray(items)) {
            return [];
        }
        return items
            .map((item) => ({ path: normalizePath(item && item.path), title: cleanTitle(item && item.title) }))
            .filter((item) => item.path && item.title)
            .slice(0, MAX_RECENT);
    }

    function parseRecentCache(raw) {
        try {
            return normalizeRecentItems(JSON.parse(raw || '[]'));
        } catch {
            return [];
        }
    }

    function readCache() {
        try {
            const local = parseRecentCache(localStorage.getItem(CACHE_KEY));
            if (local.length) {
                return local;
            }
        } catch {
            // Try session storage below.
        }

        for (const key of [CACHE_KEY, LEGACY_CACHE_KEY]) {
            try {
                const session = parseRecentCache(sessionStorage.getItem(key));
                if (session.length) {
                    return session;
                }
            } catch {
                // Continue to the next compatible cache.
            }
        }
        return [];
    }

    function writeCache(items) {
        const serialized = JSON.stringify(normalizeRecentItems(items));
        try {
            localStorage.setItem(CACHE_KEY, serialized);
            return;
        } catch {
            // Fall back to per-tab storage when persistent storage is unavailable.
        }
        try {
            sessionStorage.setItem(CACHE_KEY, serialized);
        } catch {
            // Recent chats still render for this page when storage is unavailable.
        }
    }

    function mergeRecent(...groups) {
        const merged = [];
        for (const group of groups) {
            for (const item of normalizeRecentItems(group)) {
                if (!merged.some((existing) => existing.path === item.path)) {
                    merged.push(item);
                }
                if (merged.length === MAX_RECENT) {
                    return merged;
                }
            }
        }
        return merged;
    }

    function getLinkTitle(link) {
        const aria = cleanTitle(link.getAttribute('aria-label'));
        const text = cleanTitle(link.innerText || link.textContent);
        const title = cleanTitle(link.getAttribute('title'));
        const candidates = [text, title, aria];

        return candidates.find((candidate) => candidate && !/^(chatgpt|打开|open)$/i.test(candidate)) || '';
    }

    function collectRecentLinks() {
        const found = [];
        const seen = new Set();

        document.querySelectorAll(`a[href]:not(#${SIDEBAR_ID} a)`).forEach((link) => {
            const path = normalizePath(link.getAttribute('href'));
            const title = getLinkTitle(link);
            const isNavigationLink = Boolean(link.closest([
                'nav',
                'aside',
                '[data-testid*="sidebar"]',
                '[id*="sidebar"]',
                '[class*="sidebar"]'
            ].join(',')));
            if (!path || !title || !isNavigationLink || seen.has(path)) {
                return;
            }
            seen.add(path);
            found.push({ path, title });
        });

        const cached = readCache();
        const currentPath = normalizePath(location.pathname);
        const merged = [];

        if (currentPath) {
            const current = found.find((item) => item.path === currentPath)
                || cached.find((item) => item.path === currentPath);
            if (current) {
                merged.push(current);
            }
        }

        merged.push(...mergeRecent(found, cached).filter((item) =>
            !merged.some((existing) => existing.path === item.path)).slice(0, MAX_RECENT - merged.length));

        writeCache(merged);
        return merged;
    }

    function parseRecentResponse(payload) {
        const source = Array.isArray(payload && payload.items)
            ? payload.items
            : (Array.isArray(payload && payload.conversations) ? payload.conversations : []);

        return normalizeRecentItems(source.map((item) => {
            const id = cleanTitle(item && (item.id || item.conversation_id));
            if (!id) {
                return null;
            }
            const gizmoId = cleanTitle(item && item.gizmo_id);
            const path = gizmoId
                ? `/g/${encodeURIComponent(gizmoId)}/c/${encodeURIComponent(id)}`
                : `/c/${encodeURIComponent(id)}`;
            return {
                path,
                title: cleanTitle(item && (item.title || item.name)) || '未命名对话'
            };
        }).filter(Boolean));
    }

    let recentRequest = null;
    let recentLastAttemptAt = 0;
    let recentState = 'loading';

    async function refreshRecentFromApi(force = false) {
        if (!isChatRoute() || typeof window.fetch !== 'function') {
            return readCache();
        }
        if (recentRequest) {
            return recentRequest;
        }
        if (!force && Date.now() - recentLastAttemptAt < RECENT_REFRESH_MS) {
            return readCache();
        }

        recentLastAttemptAt = Date.now();
        recentState = 'loading';
        renderRecent(readCache(), recentState);

        recentRequest = (async () => {
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            const timeout = controller ? window.setTimeout(() => controller.abort(), 8000) : 0;
            try {
                const url = new URL('/backend-api/conversations', location.origin);
                url.searchParams.set('offset', '0');
                url.searchParams.set('limit', String(MAX_RECENT));
                url.searchParams.set('order', 'updated');
                url.searchParams.set('is_archived', 'false');
                const response = await window.fetch(url, {
                    credentials: 'include',
                    cache: 'no-store',
                    headers: { Accept: 'application/json' },
                    signal: controller ? controller.signal : undefined
                });
                if (!response.ok) {
                    throw new Error(`Recent chats request failed with HTTP ${response.status}`);
                }

                const apiItems = parseRecentResponse(await response.json());
                const recent = mergeRecent(apiItems, collectRecentLinks(), readCache());
                if (recent.length) {
                    writeCache(recent);
                }
                recentState = recent.length ? 'ready' : 'empty';
                renderRecent(recent, recentState);
                return recent;
            } catch {
                const fallback = collectRecentLinks();
                recentState = fallback.length ? 'ready' : 'unavailable';
                renderRecent(fallback, recentState);
                return fallback;
            } finally {
                if (timeout) {
                    window.clearTimeout(timeout);
                }
                recentRequest = null;
            }
        })();

        return recentRequest;
    }

    function findNativeConversationLink(path) {
        return Array.from(document.querySelectorAll(`a[href]:not(#${SIDEBAR_ID} a)`))
            .find((link) => normalizePath(link.getAttribute('href')) === path);
    }

    function navigateWithNativeControl(path, nativeControl) {
        if (nativeControl) {
            nativeControl.click();
            window.setTimeout(() => {
                if (location.pathname !== path) {
                    location.assign(path);
                }
            }, 350);
            return;
        }
        location.assign(path);
    }

    function findNewChatControl() {
        const direct = document.querySelector([
            '[data-testid="create-new-chat-button"]',
            '[data-testid="new-chat-button"]',
            'a[aria-label="New chat"]',
            'a[aria-label="新聊天"]',
            'button[aria-label="New chat"]',
            'button[aria-label="新聊天"]'
        ].join(','));

        if (direct && !direct.closest(`#${SIDEBAR_ID}`)) {
            return direct;
        }

        return Array.from(document.querySelectorAll(`a[href]:not(#${SIDEBAR_ID} a)`))
            .find((link) => {
                try {
                    return new URL(link.getAttribute('href'), location.origin).pathname === '/';
                } catch {
                    return false;
                }
            });
    }

    function createSidebar() {
        if (!document.body || document.getElementById(SIDEBAR_ID)) {
            return;
        }

        const mobileToggle = document.createElement('button');
        mobileToggle.id = MOBILE_TOGGLE_ID;
        mobileToggle.type = 'button';
        mobileToggle.hidden = true;
        mobileToggle.textContent = '☰';
        mobileToggle.setAttribute('aria-label', '打开专注导航');
        mobileToggle.setAttribute('aria-controls', SIDEBAR_ID);
        mobileToggle.addEventListener('click', openMobileSidebar);

        const backdrop = document.createElement('button');
        backdrop.id = BACKDROP_ID;
        backdrop.type = 'button';
        backdrop.hidden = true;
        backdrop.tabIndex = -1;
        backdrop.setAttribute('aria-label', '关闭专注导航');
        backdrop.addEventListener('click', () => closeMobileSidebar(true));

        const sidebar = document.createElement('aside');
        sidebar.id = SIDEBAR_ID;
        sidebar.setAttribute('aria-label', 'ChatGPT 专注导航');

        const toolbar = document.createElement('div');
        toolbar.className = 'cgpt-focus-toolbar';

        const title = document.createElement('span');
        title.className = 'cgpt-focus-title';
        title.textContent = 'ChatGPT Focus';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'cgpt-focus-toggle';
        toggle.setAttribute('aria-controls', SIDEBAR_ID);
        toggle.addEventListener('click', () => {
            if (isMobileViewport()) {
                closeMobileSidebar(true);
                return;
            }
            setSidebarCollapsed(!document.documentElement.classList.contains('cgpt-focus-collapsed'));
        });
        toolbar.append(title, toggle);

        const newChat = document.createElement('button');
        newChat.type = 'button';
        newChat.className = 'cgpt-focus-new';
        newChat.title = '新聊天';
        newChat.innerHTML = '<span class="cgpt-focus-plus" aria-hidden="true">+</span><span class="cgpt-focus-new-label">新聊天</span>';
        newChat.addEventListener('click', () => {
            closeMobileSidebar();
            navigateWithNativeControl('/', findNewChatControl());
        });

        const readingControls = document.createElement('div');
        readingControls.className = 'cgpt-focus-reading-controls';
        readingControls.setAttribute('role', 'group');
        readingControls.setAttribute('aria-label', '正文阅读字号');

        const readingLabel = document.createElement('span');
        readingLabel.className = 'cgpt-focus-reading-label';
        readingLabel.textContent = '正文字号';

        const stepper = document.createElement('div');
        stepper.className = 'cgpt-focus-stepper';

        const decreaseFont = document.createElement('button');
        decreaseFont.type = 'button';
        decreaseFont.className = 'cgpt-focus-font-button';
        decreaseFont.dataset.fontAction = 'decrease';
        decreaseFont.textContent = 'A−';
        decreaseFont.title = '减小正文字号';
        decreaseFont.setAttribute('aria-label', '减小正文字号');

        const fontSize = document.createElement('output');
        fontSize.className = 'cgpt-focus-font-size';

        const increaseFont = document.createElement('button');
        increaseFont.type = 'button';
        increaseFont.className = 'cgpt-focus-font-button';
        increaseFont.dataset.fontAction = 'increase';
        increaseFont.textContent = 'A+';
        increaseFont.title = '增大正文字号';
        increaseFont.setAttribute('aria-label', '增大正文字号');

        decreaseFont.addEventListener('click', () => setFontSize(currentFontSize - 1));
        increaseFont.addEventListener('click', () => setFontSize(currentFontSize + 1));
        stepper.append(decreaseFont, fontSize, increaseFont);
        readingControls.append(readingLabel, stepper);

        const list = document.createElement('nav');
        list.className = 'cgpt-focus-list';
        list.setAttribute('aria-label', '最近聊天');
        list.setAttribute('aria-live', 'polite');

        const footer = document.createElement('footer');
        footer.className = 'cgpt-focus-footer';

        const version = document.createElement('span');
        version.textContent = `v${SCRIPT_VERSION}`;
        version.title = `Released ${SCRIPT_RELEASED_AT}`;

        const released = document.createElement('span');
        released.className = 'cgpt-focus-release';
        released.textContent = SCRIPT_RELEASED_AT.slice(0, 10);
        released.title = SCRIPT_RELEASED_AT;
        footer.append(version, released);

        sidebar.append(toolbar, newChat, readingControls, list, footer);
        document.body.append(backdrop, sidebar, mobileToggle);
        setSidebarCollapsed(document.documentElement.classList.contains('cgpt-focus-collapsed'), false);
        setFontSize(readFontSize(), false);
    }

    function renderRecent(items, state = items.length ? 'ready' : recentState) {
        const list = document.querySelector(`#${SIDEBAR_ID} .cgpt-focus-list`);
        if (!list) {
            return;
        }

        const currentPath = normalizePath(location.pathname);
        const signature = JSON.stringify([state, ...items.map((item) => [item.path, item.title, item.path === currentPath])]);
        if (list.dataset.signature === signature) {
            return;
        }

        const fragment = document.createDocumentFragment();
        if (!items.length) {
            const status = document.createElement('p');
            status.className = 'cgpt-focus-recent-status';
            status.textContent = {
                loading: '正在读取最近对话…',
                empty: '暂无最近对话',
                unavailable: '最近对话暂不可用'
            }[state] || '暂无最近对话';
            fragment.appendChild(status);
        }
        for (const item of items.slice(0, MAX_RECENT)) {
            const link = document.createElement('a');
            link.className = 'cgpt-focus-chat';
            link.href = item.path;
            link.textContent = item.title;
            link.title = item.title;
            if (item.path === currentPath) {
                link.setAttribute('aria-current', 'page');
            }
            link.addEventListener('click', (event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                    return;
                }
                event.preventDefault();
                closeMobileSidebar();
                navigateWithNativeControl(item.path, findNativeConversationLink(item.path));
            });
            fragment.appendChild(link);
        }

        list.replaceChildren(fragment);
        list.dataset.signature = signature;
    }

    function markAppRoot() {
        const main = document.querySelector('main');
        if (!main || !document.body) {
            return;
        }

        let root = main;
        while (root.parentElement && root.parentElement !== document.body) {
            root = root.parentElement;
        }
        if (root !== document.body && root.id !== SIDEBAR_ID) {
            document.querySelectorAll('.cgpt-focus-app-root').forEach((element) => {
                if (element !== root) {
                    element.classList.remove('cgpt-focus-app-root');
                }
            });
            root.classList.add('cgpt-focus-app-root');
        }
    }

    function markNativeSidebars() {
        document.querySelectorAll(`a[href]:not(#${SIDEBAR_ID} a)`).forEach((link) => {
            if (!normalizePath(link.getAttribute('href'))) {
                return;
            }

            const sidebar = link.closest([
                'aside',
                '[data-testid*="sidebar"]',
                '[id*="sidebar"]',
                '[class*="sidebar"]'
            ].join(','));

            if (sidebar && sidebar.id !== SIDEBAR_ID) {
                sidebar.classList.add('cgpt-focus-native-sidebar');
                return;
            }

            const nav = link.closest('nav');
            if (nav && !nav.closest(`#${SIDEBAR_ID}`)) {
                nav.classList.add('cgpt-focus-native-sidebar');
            }
        });
    }

    function markNativeSidebarControls() {
        document.querySelectorAll([
            'header button',
            'header a[role="button"]',
            'button[data-testid*="sidebar" i]',
            'a[role="button"][data-testid*="sidebar" i]',
            'button[aria-label*="sidebar" i]',
            'button[aria-label*="侧边栏" i]',
            'button[aria-label*="边栏" i]'
        ].join(',')).forEach((control) => {
            if (control.closest(`#${SIDEBAR_ID}`)) {
                return;
            }

            const identity = [
                control.id,
                control.getAttribute('data-testid'),
                control.getAttribute('aria-label'),
                control.getAttribute('title')
            ].filter(Boolean).join(' ');

            if (/(?:^|[\s_-])sidebar(?:$|[\s_-])|侧边栏|边栏/i.test(identity)) {
                control.classList.add('cgpt-focus-native-sidebar-control');
            }
        });
    }

    function setActiveState() {
        const active = isChatRoute();
        const routeChanged = modelSetupPath !== location.pathname;
        if (routeChanged) {
            resetModelSetup(location.pathname);
        }
        const root = document.documentElement;
        root.classList.toggle('cgpt-focus-active', active);
        root.classList.toggle('cgpt-focus-home', active && location.pathname === '/');

        if (isMobileViewport() && (!active || routeChanged)) {
            setSidebarCollapsed(true, false);
        } else {
            setSidebarCollapsed(root.classList.contains('cgpt-focus-collapsed'), false);
        }

        const sidebar = document.getElementById(SIDEBAR_ID);
        if (sidebar) {
            sidebar.hidden = !active;
        }
        const mobileToggle = document.getElementById(MOBILE_TOGGLE_ID);
        if (mobileToggle) {
            mobileToggle.hidden = !active;
        }
        if (!active) {
            const backdrop = document.getElementById(BACKDROP_ID);
            if (backdrop) {
                backdrop.hidden = true;
            }
        }
        return active;
    }

    function refresh() {
        createSidebar();
        if (!setActiveState()) {
            return;
        }
        markAppRoot();
        removeWorkUi();
        pruneNonChatControls();
        if (location.pathname === '/') {
            pruneHome();
        }
        const recent = collectRecentLinks();
        if (recent.length) {
            recentState = 'ready';
        }
        renderRecent(recent, recentState);
        void refreshRecentFromApi();
        markNativeSidebars();
        markNativeSidebarControls();
        scheduleModelSetup();
    }

    let refreshTimer = 0;
    function scheduleRefresh(delay = 80) {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(refresh, delay);
    }

    function nodeMayAffectFocusUi(node) {
        if (!(node instanceof Element)
            || node.closest(`#${SIDEBAR_ID}`)
            || node.matches(`#${MOBILE_TOGGLE_ID}, #${BACKDROP_ID}`)) {
            return false;
        }

        const selector = [
            'a[href*="/c/"]',
            '#page-header',
            '#page-header [aria-label]',
            '#page-header [role="radiogroup"]',
            '[data-testid*="sidebar"]',
            '[data-testid*="work-mode" i]',
            '[data-testid*="composer-work" i]',
            '[data-testid*="voice-mode" i]',
            '[data-testid*="voice-input" i]',
            '[data-testid*="prompt-starter" i]',
            '[data-testid*="starter-prompt" i]',
            '[data-testid*="suggested-prompt" i]',
            'header',
            'main'
        ].join(',');

        if (node.closest('#page-header, header') || node.matches(selector) || node.querySelector(selector)) {
            return true;
        }

        if (document.documentElement.classList.contains('cgpt-focus-home') && node.closest('main')) {
            const homeSelector = 'button, [role="button"], h1, h2, h3, [role="heading"], #prompt-textarea, textarea';
            return node.matches(homeSelector) || Boolean(node.querySelector(homeSelector));
        }

        return false;
    }

    function start() {
        refresh();

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (nodeMayAffectFocusUi(node)) {
                        scheduleRefresh();
                        return;
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('popstate', () => scheduleRefresh(0));
        window.addEventListener('cgpt-focus-navigate', () => scheduleRefresh(0));
        window.addEventListener('focus', () => {
            void refreshRecentFromApi();
        });
        document.addEventListener('keydown', (event) => {
            if (event.isTrusted
                && event.key === 'Escape'
                && isMobileViewport()
                && !document.documentElement.classList.contains('cgpt-focus-collapsed')) {
                event.stopPropagation();
                closeMobileSidebar(true);
            }
        });

        const handleViewportChange = () => {
            setSidebarCollapsed(readCollapsedState(), false);
            scheduleRefresh(0);
        };
        if (typeof mobileMedia.addEventListener === 'function') {
            mobileMedia.addEventListener('change', handleViewportChange);
        } else if (typeof mobileMedia.addListener === 'function') {
            mobileMedia.addListener(handleViewportChange);
        }

        for (const method of ['pushState', 'replaceState']) {
            const original = history[method];
            history[method] = function (...args) {
                const result = original.apply(this, args);
                window.dispatchEvent(new Event('cgpt-focus-navigate'));
                return result;
            };
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
