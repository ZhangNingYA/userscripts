// ==UserScript==
// @name         测试1
// @name:zh-CN   测试1
// @name:en      Test 1
// @namespace    https://scripts.fulafu.com/
// @version      2.3.3
// @lastUpdated  2026-09-05 15:30
// @description  整合五个视频工具模块：3GO 与 SP2026/91Porn 高清直链、老王论坛视频解析、JavHub 完整视频下载、XAsian 完整播放，以及 AVJB/BBAV HLS 播放与下载。
// @description:zh-CN 整合五个视频工具模块：3GO 与 SP2026/91Porn 高清直链、老王论坛视频解析、JavHub 完整视频下载、XAsian 完整播放，以及 AVJB/BBAV HLS 播放与下载。
// @description:en Five video tools: HD links for 3GO and SP2026/91Porn, video extraction for Laowang Forum, full-video downloads for JavHub, complete playback for XAsian, and HLS playback and downloads for AVJB/BBAV.
// @author       local
// @homepageURL  https://scripts.fulafu.com/scripts/test1/
// @supportURL   https://github.com/ZhangNingYA/userscripts/issues
// @updateURL    https://scripts.fulafu.com/scripts/test1/test1.user.js
// @downloadURL  https://scripts.fulafu.com/scripts/test1/test1.user.js
// @match        *://media.3go.fun/*
// @match        *://tube.3go.fun/*
// @match        *://up.sp2026.com/*
// @match        *://*.sp2026.com/*
// @match        *://91.9p9.xyz/ev.php*
// @match        *://*.9p9.xyz/*
// @match        *://www.91porn.com/*
// @match        *://91porn.com/*
// @match        *://*.91porn.com/*
// @match        *://laowang.vip/*
// @match        *://*.laowang.vip/*
// @match        *://laowangopk893.vip/*
// @match        https://javhub.net/play/*
// @match        https://ja.javhub.net/play/*
// @match        *://xasian.org/*
// @match        *://*.xasian.org/*
// @match        *://bbav110.com/*
// @match        *://*.bbav110.com/*
// @match        *://avjb.com/*
// @match        *://*.avjb.com/*
// @include      /^https?:\/\/[^/]*laowang[^/]*\//
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js
// @require      https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_cookie
// @connect      *
// @noframes
// ==/UserScript==

/* =====================================================================
 * 模块 1/5：直链播放器（3*O + 91/SP*） v1.2.0
 * ===================================================================== */

(function () {
  "use strict";

  const HOST = location.hostname.toLowerCase();
  const PREF = "nsfw_dp_";

  function is3go() {
    return /(^|\.)3go\.fun$/i.test(HOST);
  }
  function isSp2026() {
    return (
      /(^|\.)sp2026\.com$/i.test(HOST) ||
      /(^|\.)9p9\.xyz$/i.test(HOST) ||
      /(^|\.)91porn\.com$/i.test(HOST)
    );
  }

  function prefGet(k, d) {
    try {
      const v = GM_getValue(PREF + k, d);
      return v === undefined ? d : v;
    } catch {
      return d;
    }
  }
  function prefSet(k, v) {
    try {
      GM_setValue(PREF + k, v);
    } catch (_) {}
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function copyText(text) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof GM_setClipboard === "function") {
          GM_setClipboard(text);
          resolve();
          return;
        }
      } catch (_) {}
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(resolve, reject);
      } else {
        reject(new Error("no clipboard"));
      }
    });
  }

  function toast(msg, kind = "ok", ms = 2200) {
    let host = document.getElementById("nsfw-dp-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "nsfw-dp-toast-host";
      document.documentElement.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = `nsfw-dp-toast ${kind}`;
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 280);
    }, ms);
  }

  function injectSharedStyles() {
    if (document.getElementById("nsfw-dp-shared-style")) return;
    GM_addStyle(`
      #nsfw-dp-toast-host {
        position: fixed; z-index: 2147483646;
        right: 16px; bottom: 72px;
        display: flex; flex-direction: column; gap: 8px;
        pointer-events: none; max-width: min(420px, calc(100vw - 32px));
      }
      .nsfw-dp-toast {
        opacity: 0; transform: translateY(8px);
        transition: opacity .22s, transform .22s;
        padding: 10px 14px; border-radius: 10px;
        font: 600 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-shadow: 0 10px 28px rgba(0,0,0,.4);
        color: #0b1220; background: #86efac;
      }
      .nsfw-dp-toast.err { background: #fca5a5; }
      .nsfw-dp-toast.info { background: #93c5fd; }
      .nsfw-dp-toast.show { opacity: 1; transform: translateY(0); }

      .nsfw-dp-panel {
        position: relative; z-index: 99990;
        margin: 12px 0 16px; padding: 0;
        border-radius: 14px; overflow: hidden;
        border: 1px solid var(--nsfw-bd, #334155);
        background: linear-gradient(165deg, var(--nsfw-bg1, #1b2433) 0%, var(--nsfw-bg2, #121820) 100%);
        color: var(--nsfw-fg, #e2e8f0);
        font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-shadow: 0 12px 32px rgba(0,0,0,.38);
      }
      .nsfw-dp-panel.theme-amber {
        --nsfw-bd: #334155; --nsfw-bg1: #1b2433; --nsfw-bg2: #121820;
        --nsfw-fg: #e2e8f0; --nsfw-accent: #fbbf24; --nsfw-accent-fg: #0f172a;
        --nsfw-sec: #334155; --nsfw-sec-fg: #e2e8f0; --nsfw-ok: #86efac; --nsfw-err: #fca5a5;
        --nsfw-muted: #94a3b8; --nsfw-input-bd: #475569; --nsfw-input-bg: #0b1220;
      }
      .nsfw-dp-panel.theme-blue {
        --nsfw-bd: #2e3a55; --nsfw-bg1: #1a1f2e; --nsfw-bg2: #12151c;
        --nsfw-fg: #e8eefc; --nsfw-accent: #7cb3ff; --nsfw-accent-fg: #0b1220;
        --nsfw-sec: #2a354d; --nsfw-sec-fg: #d7e3ff; --nsfw-ok: #8dffb0; --nsfw-err: #ff8f8f;
        --nsfw-muted: #a9b6d3; --nsfw-input-bd: #3a4663; --nsfw-input-bg: #0d111a;
      }
      .nsfw-dp-hd {
        display: flex; align-items: center; gap: 10px;
        padding: 11px 14px; cursor: default;
        border-bottom: 1px solid color-mix(in srgb, var(--nsfw-bd) 70%, transparent);
        user-select: none;
      }
      .nsfw-dp-hd h3 {
        margin: 0; flex: 1; min-width: 0;
        font-size: 15px; font-weight: 700; letter-spacing: .02em;
        color: var(--nsfw-accent);
      }
      .nsfw-dp-hd h3 small {
        display: inline; margin-left: 6px;
        font-weight: 500; font-size: 11px; opacity: .72; color: var(--nsfw-fg);
      }
      .nsfw-dp-hd .nsfw-dp-tools { display: flex; gap: 6px; flex-shrink: 0; }
      .nsfw-dp-iconbtn {
        appearance: none; border: 0; border-radius: 8px;
        width: 30px; height: 30px; padding: 0;
        cursor: pointer; font-size: 14px; line-height: 1;
        background: var(--nsfw-sec); color: var(--nsfw-sec-fg);
      }
      .nsfw-dp-iconbtn:hover { filter: brightness(1.12); }
      .nsfw-dp-body { padding: 12px 14px 14px; }
      .nsfw-dp-panel.collapsed .nsfw-dp-body { display: none; }
      .nsfw-dp-panel.collapsed .nsfw-dp-hd { border-bottom: 0; }
      .nsfw-dp-sub { margin: 0 0 10px; font-size: 12px; color: var(--nsfw-muted); }
      .nsfw-dp-row {
        display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0;
      }
      .nsfw-dp-panel button.nsfw-btn,
      .nsfw-dp-panel a.nsfw-btn {
        appearance: none; border: 0; border-radius: 8px;
        padding: 8px 12px; cursor: pointer;
        font-weight: 650; font-size: 12px; text-decoration: none;
        color: var(--nsfw-accent-fg); background: var(--nsfw-accent);
        display: inline-flex; align-items: center; gap: 6px;
      }
      .nsfw-dp-panel button.nsfw-btn.secondary,
      .nsfw-dp-panel a.nsfw-btn.secondary {
        background: var(--nsfw-sec); color: var(--nsfw-sec-fg);
      }
      .nsfw-dp-panel button.nsfw-btn:disabled {
        opacity: .55; cursor: wait;
      }
      .nsfw-dp-panel button.nsfw-btn.busy::before {
        content: ""; width: 12px; height: 12px; border-radius: 50%;
        border: 2px solid color-mix(in srgb, currentColor 35%, transparent);
        border-top-color: currentColor;
        animation: nsfw-spin .7s linear infinite;
      }
      @keyframes nsfw-spin { to { transform: rotate(360deg); } }
      .nsfw-dp-panel input.nsfw-url {
        flex: 1 1 220px; min-width: 0;
        border-radius: 8px; border: 1px solid var(--nsfw-input-bd);
        background: var(--nsfw-input-bg); color: var(--nsfw-fg);
        padding: 8px 10px; font-size: 12px; font-family: ui-monospace, monospace;
      }
      .nsfw-dp-panel input.nsfw-url:focus {
        outline: 2px solid color-mix(in srgb, var(--nsfw-accent) 55%, transparent);
        outline-offset: 1px;
      }
      .nsfw-dp-status {
        font-size: 12px; color: var(--nsfw-muted);
        word-break: break-all; white-space: pre-wrap; min-height: 1.35em;
      }
      .nsfw-dp-status.ok { color: var(--nsfw-ok); }
      .nsfw-dp-status.err { color: var(--nsfw-err); }
      .nsfw-dp-meta {
        display: flex; flex-wrap: wrap; gap: 6px 12px;
        font-size: 12px; color: var(--nsfw-fg); margin: 4px 0 2px;
      }
      .nsfw-dp-meta b { color: var(--nsfw-accent); font-weight: 650; }
      .nsfw-dp-steps {
        display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px;
      }
      .nsfw-dp-step {
        font-size: 11px; padding: 3px 8px; border-radius: 999px;
        background: var(--nsfw-sec); color: var(--nsfw-muted);
      }
      .nsfw-dp-step.on { color: var(--nsfw-accent-fg); background: var(--nsfw-accent); }
      .nsfw-dp-step.done { color: #052e16; background: var(--nsfw-ok); }
      .nsfw-dp-step.fail { color: #450a0a; background: var(--nsfw-err); }
      .nsfw-dp-panel video.nsfw-vid {
        display: none; width: 100%;
        max-height: min(70vh, 720px); margin-top: 10px;
        border-radius: 8px; background: #000;
      }
      .nsfw-dp-panel video.nsfw-vid.show { display: block; }
      .nsfw-dp-opts {
        display: flex; flex-wrap: wrap; gap: 10px 14px;
        margin-top: 8px; font-size: 12px; color: var(--nsfw-muted);
      }
      .nsfw-dp-opts label {
        display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
      }
      .nsfw-dp-opts input { accent-color: var(--nsfw-accent); }
      .nsfw-dp-hotkey {
        margin-top: 6px; font-size: 11px; color: var(--nsfw-muted); opacity: .85;
      }
      .nsfw-dp-hotkey kbd {
        font: 600 10px/1 ui-monospace, monospace;
        padding: 1px 5px; border-radius: 4px;
        border: 1px solid var(--nsfw-bd); background: var(--nsfw-input-bg);
      }
      .nsfw-dp-float {
        position: fixed; z-index: 100000;
        right: 16px; bottom: 18px;
        border: 0; border-radius: 999px;
        padding: 11px 16px; cursor: grab;
        font-weight: 750; font-size: 13px;
        color: #1c1917;
        background: linear-gradient(135deg, #fbbf24, #f59e0b);
        box-shadow: 0 8px 22px rgba(0,0,0,.4);
        user-select: none; touch-action: none;
      }
      .nsfw-dp-float.blue {
        background: linear-gradient(135deg, #ffd15c, #fbbf24);
      }
      .nsfw-dp-float:hover { filter: brightness(1.06); }
      .nsfw-dp-float.dragging { cursor: grabbing; opacity: .92; }
      .nsfw-dp-float.busy { opacity: .7; pointer-events: none; }
      @media (max-width: 640px) {
        .nsfw-dp-panel button.nsfw-btn, .nsfw-dp-panel a.nsfw-btn {
          flex: 1 1 auto; justify-content: center;
        }
      }
    `);
  }

  function makePanel({ ns, theme, title, subtitle, bodyHtml, collapsedKey }) {
    injectSharedStyles();
    let root = document.getElementById(`${ns}-root`);
    if (root) return root;

    const collapsed = !!prefGet(collapsedKey || `${ns}_collapsed`, false);
    root = document.createElement("div");
    root.id = `${ns}-root`;
    root.className = `nsfw-dp-panel theme-${theme || "amber"}${collapsed ? " collapsed" : ""}`;
    root.innerHTML = `
      <div class="nsfw-dp-hd">
        <h3>${title}<small>${subtitle || ""}</small></h3>
        <div class="nsfw-dp-tools">
          <button type="button" class="nsfw-dp-iconbtn" data-act="collapse" title="折叠/展开">▾</button>
          <button type="button" class="nsfw-dp-iconbtn" data-act="hide" title="隐藏面板（浮钮仍可用）">✕</button>
        </div>
      </div>
      <div class="nsfw-dp-body">${bodyHtml}</div>
    `;

    const collapseBtn = root.querySelector('[data-act="collapse"]');
    const syncCollapseIcon = () => {
      collapseBtn.textContent = root.classList.contains("collapsed") ? "▸" : "▾";
    };
    syncCollapseIcon();

    root.addEventListener("click", (ev) => {
      const t = ev.target.closest("[data-act]");
      if (!t || !root.contains(t)) return;
      const act = t.getAttribute("data-act");
      if (act === "collapse") {
        ev.preventDefault();
        root.classList.toggle("collapsed");
        prefSet(collapsedKey || `${ns}_collapsed`, root.classList.contains("collapsed"));
        syncCollapseIcon();
      } else if (act === "hide") {
        ev.preventDefault();
        root.style.display = "none";
        toast("面板已隐藏，点右下角浮钮可重新打开", "info");
      }
    });

    return root;
  }

  function mountBefore(el, target, mode) {
    if (!target || target === document.body) {
      document.body.insertBefore(el, document.body.firstChild);
      return;
    }
    if (mode === "prepend") {
      target.insertBefore(el, target.firstChild);
    } else if (mode === "after") {
      target.parentNode.insertBefore(el, target.nextSibling);
    } else {
      target.parentNode.insertBefore(el, target);
    }
  }

  function setBusy(btn, busy, labelIdle) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.label) btn.dataset.label = btn.textContent;
      btn.disabled = true;
      btn.classList.add("busy");
      if (labelIdle) btn.textContent = labelIdle;
    } else {
      btn.disabled = false;
      btn.classList.remove("busy");
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }
  }

  function setStatus(root, msg, kind) {
    const el = root.querySelector("[data-status]");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("ok", "err");
    if (kind) el.classList.add(kind);
  }

  function setSteps(root, active, map) {
    const box = root.querySelector("[data-steps]");
    if (!box) return;
    box.querySelectorAll("[data-step]").forEach((el) => {
      const id = el.getAttribute("data-step");
      el.classList.remove("on", "done", "fail");
      const st = map && map[id];
      if (st === "done") el.classList.add("done");
      else if (st === "fail") el.classList.add("fail");
      else if (id === active || st === "on") el.classList.add("on");
    });
  }

  function bindUrlInput(root) {
    const input = root.querySelector("[data-url]");
    if (!input || input.dataset.bound) return;
    input.dataset.bound = "1";
    input.addEventListener("focus", () => input.select());
    input.addEventListener("dblclick", async () => {
      if (!input.value) return;
      try {
        await copyText(input.value);
        toast("已复制直链");
        setStatus(root, "已复制直链到剪贴板。", "ok");
      } catch {
        input.select();
        toast("请手动 Ctrl+C", "err");
      }
    });
  }

  function applyLink(root, mp4, { filename, autoPlay } = {}) {
    const input = root.querySelector("[data-url]");
    const aOpen = root.querySelector("[data-open]");
    const aDl = root.querySelector("[data-download]");
    const btnCopy = root.querySelector('[data-act="copy"]');
    const btnPlay = root.querySelector('[data-act="play"]');
    const btnPip = root.querySelector('[data-act="pip"]');
    const video = root.querySelector("[data-video]");

    if (input) input.value = mp4;
    if (btnCopy) btnCopy.disabled = false;
    if (btnPlay) btnPlay.disabled = false;
    if (btnPip) btnPip.disabled = false;
    if (aOpen) {
      aOpen.style.display = "";
      aOpen.href = mp4;
    }
    if (aDl) {
      aDl.style.display = "";
      aDl.href = mp4;
      if (filename) aDl.setAttribute("download", filename);
    }

    if (video && autoPlay) {
      playVideo(root, mp4);
    }
  }

  function playVideo(root, mp4) {
    const video = root.querySelector("[data-video]");
    if (!video) return;
    const src = mp4 || root.querySelector("[data-url]")?.value;
    if (!src) return;
    video.classList.add("show");
    video.style.display = "block";
    video.removeAttribute("crossorigin");
    if (video.src !== src) {
      video.src = src;
      video.load();
    }
    const p = video.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    setStatus(root, "页内播放中 · 支持拖动进度（HTTP Range）。", "ok");
  }

  async function doCopy(root) {
    const url = root.querySelector("[data-url]")?.value;
    if (!url) return;
    try {
      await copyText(url);
      toast("已复制直链");
      setStatus(root, "已复制直链到剪贴板。", "ok");
    } catch {
      root.querySelector("[data-url]")?.select();
      toast("复制失败，已选中链接", "err");
      setStatus(root, "自动复制失败，请 Ctrl+C。", "err");
    }
  }

  async function doPip(root) {
    const video = root.querySelector("[data-video]");
    if (!video) return;
    if (!video.src) playVideo(root);
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        if (video.readyState < 1) {
          await new Promise((r) => video.addEventListener("loadedmetadata", r, { once: true }));
        }
        await video.requestPictureInPicture();
        toast("已进入画中画", "info");
      } else {
        toast("当前浏览器不支持画中画", "err");
      }
    } catch (e) {
      toast("画中画失败: " + (e.message || e), "err");
    }
  }

  function makeFloat({ id, label, theme, onClick }) {
    let btn = document.getElementById(id);
    if (btn) return btn;
    injectSharedStyles();
    btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.className = `nsfw-dp-float${theme === "blue" ? " blue" : ""}`;
    btn.textContent = label;

    const pos = prefGet("float_pos", null);
    if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
      btn.style.left = pos.x + "px";
      btn.style.top = pos.y + "px";
      btn.style.right = "auto";
      btn.style.bottom = "auto";
    }

    let drag = null;
    let moved = false;

    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      moved = false;
      const r = btn.getBoundingClientRect();
      drag = {
        id: e.pointerId,
        ox: e.clientX - r.left,
        oy: e.clientY - r.top,
        sx: e.clientX,
        sy: e.clientY,
      };
      btn.setPointerCapture(e.pointerId);
      btn.classList.add("dragging");
    });
    btn.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) moved = true;
      if (!moved) return;
      const x = Math.max(0, Math.min(window.innerWidth - btn.offsetWidth, e.clientX - drag.ox));
      const y = Math.max(0, Math.min(window.innerHeight - btn.offsetHeight, e.clientY - drag.oy));
      btn.style.left = x + "px";
      btn.style.top = y + "px";
      btn.style.right = "auto";
      btn.style.bottom = "auto";
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      btn.classList.remove("dragging");
      if (moved) {
        prefSet("float_pos", {
          x: parseFloat(btn.style.left) || 0,
          y: parseFloat(btn.style.top) || 0,
        });
      }
      drag = null;
    };
    btn.addEventListener("pointerup", endDrag);
    btn.addEventListener("pointercancel", endDrag);

    btn.addEventListener("click", (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
        return;
      }
      onClick(e);
    });

    document.body.appendChild(btn);
    return btn;
  }

  function bindHotkeys(handler) {
    if (window.__nsfwDpHotkeys) return;
    window.__nsfwDpHotkeys = true;
    document.addEventListener("keydown", (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const tag = (e.target && e.target.tagName) || "";
        if (/^(INPUT|TEXTAREA|SELECT)$/i.test(tag) || e.target?.isContentEditable) return;
        handler(e);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 3*O
  // ═══════════════════════════════════════════════════════════
  function run3go() {
    const NS = "go3-orig";
    const API = (token) =>
      `${location.origin}/api/v1/media/${encodeURIComponent(token)}`;
    const log = (...a) => console.log(`[${NS}]`, ...a);

    function gmGet(url) {
      return new Promise((resolve, reject) => {
        fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
        })
          .then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const ct = r.headers.get("content-type") || "";
            if (ct.includes("json")) resolve(await r.json());
            else resolve(await r.text());
          })
          .catch(() => {
            if (typeof GM_xmlhttpRequest !== "function") {
              reject(new Error("fetch failed and no GM_xmlhttpRequest"));
              return;
            }
            GM_xmlhttpRequest({
              method: "GET",
              url,
              headers: { Accept: "application/json" },
              timeout: 30000,
              onload(res) {
                if (res.status < 200 || res.status >= 400) {
                  reject(new Error(`HTTP ${res.status}`));
                  return;
                }
                try {
                  resolve(JSON.parse(res.responseText));
                } catch {
                  resolve(res.responseText);
                }
              },
              onerror: () => reject(new Error("network error")),
              ontimeout: () => reject(new Error("timeout")),
            });
          });
      });
    }

    function encodeMediaPath(path) {
      if (!path) return path;
      if (/^https?:\/\//i.test(path)) return path;
      const p = path.startsWith("/") ? path : `/${path}`;
      return p
        .split("/")
        .map((seg) => (seg ? encodeURIComponent(seg) : ""))
        .join("/");
    }

    function absUrl(pathOrUrl) {
      if (!pathOrUrl) return null;
      if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
      return new URL(encodeMediaPath(pathOrUrl), location.origin).href;
    }

    function getTokenFromLocation() {
      const u = new URL(location.href);
      const m = u.searchParams.get("m");
      if (m) return m;
      const path = u.pathname.match(/\/(?:view|media)\/([^/?#]+)/i);
      if (path) return decodeURIComponent(path[1]);
      return null;
    }

    function isViewPage() {
      return (
        /\/view\/?$/i.test(location.pathname) ||
        /[?&]m=/.test(location.search) ||
        /\/(?:view|media)\/[^/?#]+/i.test(location.pathname)
      );
    }

    function fmtDur(sec) {
      if (sec == null || isNaN(sec)) return "-";
      sec = Math.round(Number(sec));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      if (h)
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      return `${m}:${String(s).padStart(2, "0")}`;
    }

    function fmtSize(n) {
      if (n == null || n === "") return null;
      const num = Number(n);
      if (!isNaN(num) && num > 1024) {
        if (num >= 1e9) return (num / 1e9).toFixed(2) + " GB";
        if (num >= 1e6) return (num / 1e6).toFixed(1) + " MB";
        if (num >= 1e3) return (num / 1e3).toFixed(0) + " KB";
      }
      return String(n);
    }

    function findMount() {
      const candidates = [
        document.querySelector(".video-player"),
        document.querySelector(".player-container"),
        document.querySelector("#page-media"),
        document.querySelector("video")?.closest("div"),
        document.querySelector("main"),
        document.querySelector("#main"),
        document.querySelector(".media-content"),
      ].filter(Boolean);
      return candidates[0] || document.body;
    }

    function ensureRoot() {
      let root = document.getElementById(`${NS}-root`);
      if (root) return root;
      root = makePanel({
        ns: NS,
        theme: "amber",
        title: "3*O 原画直链",
        subtitle: "绕过 VIP 下载",
        bodyHtml: `
          <p class="nsfw-dp-sub">公开 API 取 original_media_url · 站内「下载」自动劫持为原画</p>
          <div class="nsfw-dp-row">
            <button type="button" class="nsfw-btn" data-act="load">获取并播放</button>
            <button type="button" class="nsfw-btn secondary" data-act="play" disabled>仅播放</button>
            <button type="button" class="nsfw-btn secondary" data-act="copy" disabled>复制</button>
            <button type="button" class="nsfw-btn secondary" data-act="pip" disabled>画中画</button>
            <a class="nsfw-btn secondary" data-open href="#" target="_blank" rel="noopener" style="display:none">新标签</a>
            <a class="nsfw-btn" data-download href="#" download style="display:none">下载原画</a>
          </div>
          <div class="nsfw-dp-meta" data-meta></div>
          <div class="nsfw-dp-row">
            <input class="nsfw-url" data-url type="text" readonly placeholder="原画 mp4 直链（双击复制）" />
          </div>
          <div class="nsfw-dp-status" data-status>就绪。</div>
          <div class="nsfw-dp-opts">
            <label><input type="checkbox" data-opt="auto_fetch" ${prefGet("go3_auto_fetch", true) ? "checked" : ""}/> 进入自动获取</label>
            <label><input type="checkbox" data-opt="auto_play" ${prefGet("go3_auto_play", false) ? "checked" : ""}/> 获取后自动播放</label>
          </div>
          <div class="nsfw-dp-hotkey">快捷键：<kbd>Alt</kbd>+<kbd>D</kbd> 获取并播放 · <kbd>Alt</kbd>+<kbd>C</kbd> 复制 · <kbd>Alt</kbd>+<kbd>P</kbd> 画中画</div>
          <video class="nsfw-vid" controls playsinline preload="metadata" data-video></video>
        `,
      });
      mountBefore(root, findMount(), "before");
      bindUrlInput(root);

      root.querySelectorAll("[data-opt]").forEach((inp) => {
        inp.addEventListener("change", () => {
          const k = inp.getAttribute("data-opt");
          prefSet("go3_" + k, !!inp.checked);
        });
      });

      return root;
    }

    function applyMedia(root, data, mp4) {
      const meta = root.querySelector("[data-meta]");
      const fname =
        (data && data.title
          ? String(data.title).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80)
          : "video") + ".mp4";

      if (meta) {
        meta.innerHTML = [
          data?.title ? `<span>标题 <b>${escapeHtml(data.title)}</b></span>` : "",
          data?.duration != null ? `<span>时长 <b>${fmtDur(data.duration)}</b></span>` : "",
          data?.size != null ? `<span>大小 <b>${escapeHtml(fmtSize(data.size))}</b></span>` : "",
          data?.video_height ? `<span>清晰度 <b>${data.video_height}p</b></span>` : "",
          data?.user ? `<span>作者 <b>${escapeHtml(String(data.user))}</b></span>` : "",
        ]
          .filter(Boolean)
          .join("");
      }

      const autoPlay =
        root.querySelector('[data-opt="auto_play"]')?.checked ||
        prefGet("go3_auto_play", false);

      applyLink(root, mp4, { filename: fname, autoPlay });
      if (!autoPlay) {
        setStatus(root, "已拿到原画直链 · 可播放 / 复制 / 下载（支持 Range）。", "ok");
      }
      prefSet("go3_last_mp4", mp4);
      prefSet("go3_last_token", getTokenFromLocation() || "");
    }

    let cachedMp4 = null;
    let loading = false;

    async function loadOriginal(root, { play } = {}) {
      if (loading) return null;
      const btn = root.querySelector('[data-act="load"]');
      loading = true;
      setBusy(btn, true, "获取中…");
      const float = document.getElementById(`${NS}-float`);
      if (float) float.classList.add("busy");
      try {
        const token = getTokenFromLocation();
        if (!token) throw new Error("当前页没有 media token（?m=…）");

        setStatus(root, "请求媒体 API…");
        const data = await gmGet(API(token));
        if (!data || typeof data !== "object") throw new Error("API 返回非 JSON");

        let orig = data.original_media_url;
        if (!orig) {
          const enc = data.encodings_info || {};
          const o = enc["0-original"] || enc.original;
          if (o && typeof o === "object") {
            for (const k of Object.keys(o)) {
              if (o[k]?.url) {
                orig = o[k].url;
                break;
              }
            }
          }
        }
        if (!orig) throw new Error("API 无 original_media_url");

        const mp4 = absUrl(orig);
        if (!mp4) throw new Error("无法拼出直链");
        if (/banned\.mp4/i.test(mp4)) throw new Error("命中 banned 占位");

        cachedMp4 = mp4;
        applyMedia(root, data, mp4);
        log("mp4", mp4);

        if (play) playVideo(root, mp4);
        toast("原画直链已就绪");
        return { data, mp4 };
      } catch (e) {
        setStatus(root, `失败: ${e && e.message ? e.message : e}`, "err");
        toast(String(e.message || e), "err");
        throw e;
      } finally {
        loading = false;
        setBusy(btn, false);
        if (float) float.classList.remove("busy");
      }
    }

    function getMp4() {
      return cachedMp4 || document.querySelector(`#${NS}-root [data-url]`)?.value || null;
    }

    function hookDownloadClicks() {
      document.addEventListener(
        "click",
        async (ev) => {
          const el = ev.target.closest("a,button,[role=button],span,div");
          if (!el) return;
          if (el.closest(`#${NS}-root`)) return;
          const label = (
            (el.getAttribute("aria-label") || "") +
            " " +
            (el.getAttribute("title") || "") +
            " " +
            (el.textContent || "")
          ).toLowerCase();
          if (!/download|下载/.test(label)) return;
          if (el.tagName === "A" && /\/media\/original\//i.test(el.href || "")) return;

          let mp4 = getMp4();
          if (!mp4) {
            try {
              const token = getTokenFromLocation();
              if (!token) return;
              const data = await gmGet(API(token));
              mp4 = absUrl(data.original_media_url);
              cachedMp4 = mp4;
            } catch {
              return;
            }
          }
          if (!mp4) return;

          ev.preventDefault();
          ev.stopPropagation();
          ev.stopImmediatePropagation();

          const a = document.createElement("a");
          a.href = mp4;
          a.target = "_blank";
          a.rel = "noopener";
          a.download = "";
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast("已用原画直链下载", "info");
          log("intercepted download →", mp4);
        },
        true
      );
    }

    function watchVipModal() {
      const obs = new MutationObserver(() => {
        const modal = document.getElementById("vip-required-modal");
        if (!modal || modal.dataset.nsfwPatched) return;
        modal.dataset.nsfwPatched = "1";

        const box =
          modal.querySelector(".vip-box") || modal.querySelector("div") || modal;
        if (box.querySelector(".nsfw-modal-dl")) return;

        const row = document.createElement("div");
        row.style.cssText = "margin-top:14px;display:flex;flex-direction:column;gap:8px";
        const b = document.createElement("button");
        b.className = "nsfw-modal-dl";
        b.type = "button";
        b.textContent = "无需 VIP · 直接打开原画";
        b.style.cssText =
          "background:#fbbf24;color:#111;border:0;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer;width:100%";
        b.addEventListener("click", async () => {
          try {
            b.disabled = true;
            b.textContent = "获取中…";
            let mp4 = getMp4();
            if (!mp4) {
              const data = await gmGet(API(getTokenFromLocation()));
              mp4 = absUrl(data.original_media_url);
              cachedMp4 = mp4;
            }
            if (mp4) window.open(mp4, "_blank", "noopener");
            modal.classList.remove("active");
            modal.style.display = "none";
            toast("已打开原画");
          } catch (e) {
            alert("获取直链失败: " + (e.message || e));
          } finally {
            b.disabled = false;
            b.textContent = "无需 VIP · 直接打开原画";
          }
        });
        row.appendChild(b);
        box.appendChild(row);
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }

    function showRoot(root) {
      root.style.display = "";
      root.classList.remove("collapsed");
      prefSet(`${NS}_collapsed`, false);
      const cb = root.querySelector('[data-act="collapse"]');
      if (cb) cb.textContent = "▾";
      root.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (!isViewPage() && !getTokenFromLocation()) return;

    const root = ensureRoot();

    root.addEventListener("click", (ev) => {
      const t = ev.target.closest("[data-act]");
      if (!t || !root.contains(t)) return;
      const act = t.getAttribute("data-act");
      if (act === "load") {
        ev.preventDefault();
        loadOriginal(root, { play: true }).catch(() => {});
      } else if (act === "play") {
        ev.preventDefault();
        playVideo(root);
      } else if (act === "copy") {
        ev.preventDefault();
        doCopy(root);
      } else if (act === "pip") {
        ev.preventDefault();
        doPip(root);
      }
    });

    makeFloat({
      id: `${NS}-float`,
      label: "原画直链",
      theme: "amber",
      onClick: () => {
        showRoot(root);
        loadOriginal(root, { play: true }).catch(() => {});
      },
    });

    hookDownloadClicks();
    watchVipModal();

    bindHotkeys((e) => {
      if (!is3go()) return;
      if (e.code === "KeyD") {
        e.preventDefault();
        showRoot(root);
        loadOriginal(root, { play: true }).catch(() => {});
      } else if (e.code === "KeyC") {
        e.preventDefault();
        doCopy(root);
      } else if (e.code === "KeyP") {
        e.preventDefault();
        doPip(root);
      }
    });

    const auto =
      root.querySelector('[data-opt="auto_fetch"]')?.checked ??
      prefGet("go3_auto_fetch", true);
    if (auto && getTokenFromLocation()) {
      loadOriginal(root).catch(() => {});
    } else {
      setStatus(root, "点「获取并播放」，或点站内下载（自动原画）。");
    }

    // SPA：history + 轮询双保险
    let lastHref = location.href;
    let lastToken = getTokenFromLocation();
    const onNav = () => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      const tok = getTokenFromLocation();
      if (!tok || tok === lastToken) return;
      lastToken = tok;
      cachedMp4 = null;
      const v = root.querySelector("[data-video]");
      if (v) {
        v.pause();
        v.removeAttribute("src");
        v.classList.remove("show");
      }
      root.querySelector("[data-url]").value = "";
      root.querySelector("[data-meta]").innerHTML = "";
      if (prefGet("go3_auto_fetch", true)) {
        loadOriginal(root).catch(() => {});
      } else {
        setStatus(root, "检测到新视频，点「获取并播放」。", "info");
      }
    };
    setInterval(onNav, 600);
    ["pushState", "replaceState"].forEach((m) => {
      const orig = history[m];
      history[m] = function () {
        const r = orig.apply(this, arguments);
        queueTimeout(onNav, 0);
        return r;
      };
    });
    window.addEventListener("popstate", onNav);
  }

  // ═══════════════════════════════════════════════════════════
  // 91 / SP*
  // ═══════════════════════════════════════════════════════════
  function runSp2026() {
    const NS = "sp2026-hd-player";
    const SHARE_HOST_RE = /https?:\/\/[^"'<\s]+\/ev\.php\?VID=[^"'<\s]+/i;
    const STRENCODE_RE =
      /strencode\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/;
    const STRENCODE2_RE = /strencode2\s*\(\s*["']([^"']+)["']\s*\)/;
    const warn = (...a) => console.warn(`[${NS}]`, ...a);

    let mjsCache = { url: "", code: "" };

    function gmGet(url, opts = {}) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: opts.method || "GET",
          url,
          headers: opts.headers || {
            "User-Agent": navigator.userAgent,
            Accept: "*/*",
          },
          responseType: opts.responseType || "text",
          timeout: opts.timeout || 45000,
          onload(res) {
            if (res.status >= 200 && res.status < 400) resolve(res);
            else reject(new Error(`HTTP ${res.status} ${url.slice(0, 100)}`));
          },
          onerror: () => reject(new Error(`network error: ${url.slice(0, 100)}`)),
          ontimeout: () => reject(new Error(`timeout: ${url.slice(0, 100)}`)),
        });
      });
    }

    function absUrl(u, base) {
      try {
        return new URL(u, base || location.href).href;
      } catch {
        return u;
      }
    }

    function findShareUrl(html) {
      const ta =
        document.querySelector("#fm-video_link") ||
        document.querySelector("textarea[name='video_link']") ||
        document.querySelector("textarea[id*='video']");
      if (ta && /ev\.php\?VID=/i.test(ta.value || "")) {
        return (ta.value.match(SHARE_HOST_RE) || [])[0] || ta.value.trim();
      }
      const m = (html || document.documentElement.innerHTML).match(SHARE_HOST_RE);
      return m ? m[0] : null;
    }

    function decodeStrencode2(html) {
      const m = html.match(STRENCODE2_RE);
      if (!m) return null;
      try {
        const decoded = decodeURIComponent(m[1]);
        const src = decoded.match(/src=['"]([^'"]+)['"]/i);
        return src ? src[1] : null;
      } catch {
        return null;
      }
    }

    function runStrencodeInFrame(mjsCode, a, b, c) {
      return new Promise((resolve, reject) => {
        const iframe = document.createElement("iframe");
        iframe.style.cssText =
          "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;border:0";
        iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
        document.documentElement.appendChild(iframe);

        const cleanup = () => {
          try {
            iframe.remove();
          } catch (_) {}
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("strencode 执行超时"));
        }, 10000);

        try {
          const idoc = iframe.contentDocument || iframe.contentWindow.document;
          idoc.open();
          idoc.write("<!doctype html><html><head></head><body></body></html>");
          idoc.close();
          const w = iframe.contentWindow;
          const s = idoc.createElement("script");
          s.textContent = mjsCode;
          idoc.body.appendChild(s);

          if (typeof w.strencode !== "function") {
            clearTimeout(timer);
            cleanup();
            reject(new Error("m.js 执行后无 strencode"));
            return;
          }
          const tag = w.strencode(a, b, c);
          const src = String(tag).match(/src=['"]([^'"]+)['"]/i);
          clearTimeout(timer);
          cleanup();
          if (!src) {
            reject(new Error("strencode 结果无 src: " + String(tag).slice(0, 100)));
            return;
          }
          resolve(src[1]);
        } catch (e) {
          clearTimeout(timer);
          cleanup();
          reject(e);
        }
      });
    }

    async function decodeShareToMp4(shareUrl, onStep) {
      onStep?.("share");
      const shareRes = await gmGet(shareUrl, {
        headers: { Accept: "text/html,*/*", Referer: location.origin + "/" },
      });
      const shareHtml = shareRes.responseText || "";
      const call = shareHtml.match(STRENCODE_RE);
      if (!call) throw new Error("分享页未找到 strencode(...)");

      onStep?.("mjs");
      let mjsUrl = "https://91.9p9.xyz/js/m.js";
      const mjsRef = shareHtml.match(/src=["']([^"']*js\/m\.js[^"']*)["']/i);
      if (mjsRef) mjsUrl = absUrl(mjsRef[1], shareUrl);

      let mjs = mjsCache.url === mjsUrl ? mjsCache.code : "";
      if (!mjs) {
        const mjsRes = await gmGet(mjsUrl, {
          headers: { Referer: shareUrl, Accept: "*/*" },
        });
        mjs = mjsRes.responseText || "";
        if (!mjs || mjs.length < 100) throw new Error("m.js 加载失败");
        mjsCache = { url: mjsUrl, code: mjs };
      }

      onStep?.("decode");
      const mp4 = await runStrencodeInFrame(mjs, call[1], call[2], call[3]);
      if (/banned\.mp4/i.test(mp4))
        throw new Error("命中 banned.mp4 反爬占位，请稍后重试");
      return mp4;
    }

    function getViewkey() {
      const m = location.search.match(/[?&]viewkey=([^&]+)/i);
      if (m) return decodeURIComponent(m[1]);
      const a = document.querySelector("a[href*='viewkey=']");
      if (a) {
        const m2 = a.href.match(/viewkey=([^&]+)/i);
        if (m2) return decodeURIComponent(m2[1]);
      }
      return null;
    }

    function isHdPage() {
      return /view_video_hd\.php/i.test(location.pathname);
    }
    function isViewPage() {
      return /view_video(?:_hd)?\.php/i.test(location.pathname);
    }
    function isSharePage() {
      return /ev\.php/i.test(location.pathname) && /[?&]VID=/i.test(location.search);
    }

    function findPlayerMount() {
      const vipHint = Array.from(
        document.querySelectorAll("div, span, p, td")
      ).find(
        (el) =>
          /只有VIP|only VIP|watch HD|开通VIP/i.test(el.textContent || "") &&
          (el.textContent || "").length < 220
      );
      if (vipHint) {
        const box =
          vipHint.closest(
            ".col-md-8, .video-border, #videodetails, .videodetails-yakov"
          ) || vipHint.parentElement;
        if (box) return { before: box, mode: "before" };
      }
      const video = document.querySelector("#player_one, video.video-js, #player video, video");
      if (video) {
        const wrap =
          video.closest(
            ".video-container, .media-parent, .example-video-container, #player"
          ) || video.parentElement;
        return { before: wrap, mode: "before" };
      }
      const details = document.querySelector(
        "#videodetails, .videodetails-yakov, .col-md-8"
      );
      if (details) return { before: details, mode: "prepend" };
      return { before: document.body, mode: "prepend" };
    }

    function ensureRoot() {
      let root = document.getElementById(`${NS}-root`);
      if (root) return root;
      root = makePanel({
        ns: NS,
        theme: "blue",
        title: "HD 直链播放器",
        subtitle: "分享链解码 · 非 VIP",
        bodyHtml: `
          <div class="nsfw-dp-steps" data-steps>
            <span class="nsfw-dp-step" data-step="share">① 分享链</span>
            <span class="nsfw-dp-step" data-step="mjs">② 解密脚本</span>
            <span class="nsfw-dp-step" data-step="decode">③ 解码直链</span>
            <span class="nsfw-dp-step" data-step="play">④ 播放</span>
          </div>
          <div class="nsfw-dp-row">
            <button type="button" class="nsfw-btn" data-act="load">获取并播放 HD</button>
            <button type="button" class="nsfw-btn secondary" data-act="sd">SD 兜底</button>
            <button type="button" class="nsfw-btn secondary" data-act="copy" disabled>复制</button>
            <button type="button" class="nsfw-btn secondary" data-act="pip" disabled>画中画</button>
            <a class="nsfw-btn secondary" data-open href="#" target="_blank" rel="noopener" style="display:none">新标签</a>
            <a class="nsfw-btn secondary" data-download href="#" download style="display:none">下载</a>
          </div>
          <div class="nsfw-dp-row">
            <input class="nsfw-url" data-url type="text" readonly placeholder="mp4 直链（双击复制）" />
          </div>
          <div class="nsfw-dp-status" data-status>就绪。</div>
          <div class="nsfw-dp-opts">
            <label><input type="checkbox" data-opt="autoplay" ${prefGet("sp_autoplay", true) ? "checked" : ""}/> 进入自动获取 HD</label>
            <label><input type="checkbox" data-opt="sd_fallback" ${prefGet("sp_sd_fallback", true) ? "checked" : ""}/> HD 失败自动试 SD</label>
          </div>
          <div class="nsfw-dp-hotkey">快捷键：<kbd>Alt</kbd>+<kbd>D</kbd> 获取 HD · <kbd>Alt</kbd>+<kbd>S</kbd> SD · <kbd>Alt</kbd>+<kbd>C</kbd> 复制 · <kbd>Alt</kbd>+<kbd>P</kbd> 画中画</div>
          <video class="nsfw-vid" controls playsinline preload="metadata" data-video style="display:none"></video>
        `,
      });
      const mount = findPlayerMount();
      mountBefore(root, mount.before, mount.mode);
      bindUrlInput(root);

      root.querySelectorAll("[data-opt]").forEach((inp) => {
        inp.addEventListener("change", () => {
          prefSet("sp_" + inp.getAttribute("data-opt"), !!inp.checked);
        });
      });

      return root;
    }

    let loading = false;

    function finishMp4(root, mp4, label) {
      const vk = getViewkey() || "video";
      applyLink(root, mp4, {
        filename: `${vk}-hd.mp4`,
        autoPlay: true,
      });
      setSteps(root, null, {
        share: "done",
        mjs: "done",
        decode: "done",
        play: "done",
      });
      setStatus(
        root,
        `${label || "已就绪"} · 支持 Range 拖动。直链有时效，失效请重试。`,
        "ok"
      );
      prefSet("sp_last_mp4", mp4);
      prefSet("sp_last_viewkey", getViewkey() || "");
      toast(label || "HD 直链就绪");
    }

    async function loadHd(root) {
      if (loading) return;
      const btn = root.querySelector('[data-act="load"]');
      loading = true;
      setBusy(btn, true, "解码中…");
      const float = document.getElementById(`${NS}-float`);
      if (float) float.classList.add("busy");

      const stepMap = {};
      const onStep = (id) => {
        Object.keys(stepMap).forEach((k) => {
          if (stepMap[k] === "on") stepMap[k] = "done";
        });
        stepMap[id] = "on";
        setSteps(root, id, stepMap);
        const labels = {
          share: "解析分享链…",
          mjs: "加载解密脚本…",
          decode: "执行 strencode…",
          play: "准备播放…",
        };
        setStatus(root, labels[id] || id);
      };

      try {
        onStep("share");
        let share = findShareUrl();

        if (!share && !isHdPage()) {
          const vk = getViewkey();
          if (!vk) throw new Error("页面没有 viewkey，无法定位视频");
          const hdPage = `${location.origin}/view_video_hd.php?viewkey=${encodeURIComponent(vk)}`;
          setStatus(root, "拉取高清页分享链…");
          const res = await gmGet(hdPage, {
            headers: { Referer: location.href, Accept: "text/html" },
          });
          share = findShareUrl(res.responseText);
          if (!share) {
            const m = (res.responseText || "").match(SHARE_HOST_RE);
            share = m ? m[0] : null;
          }
        }
        if (!share) throw new Error("未找到 ev.php?VID= 分享链接（页面结构可能变了）");

        const mp4 = await decodeShareToMp4(share, onStep);
        onStep("play");
        finishMp4(root, mp4, "HD 直链");
      } catch (e) {
        warn(e);
        setSteps(root, null, { ...stepMap, decode: "fail" });
        setStatus(root, `失败: ${e && e.message ? e.message : e}`, "err");
        toast(String(e.message || e), "err");

        const fb =
          root.querySelector('[data-opt="sd_fallback"]')?.checked ??
          prefGet("sp_sd_fallback", true);
        if (fb) {
          setStatus(root, `HD 失败，尝试 SD…\n${e.message || e}`, "err");
          try {
            await loadSd(root, { silent: true });
          } catch (_) {}
        }
      } finally {
        loading = false;
        setBusy(btn, false);
        if (float) float.classList.remove("busy");
      }
    }

    async function loadSd(root, { silent } = {}) {
      const btn = root.querySelector('[data-act="sd"]');
      if (!silent) setBusy(btn, true, "解析中…");
      try {
        if (!silent) setStatus(root, "解析 SD strencode2…");
        let mp4 = decodeStrencode2(document.documentElement.innerHTML);
        if (!mp4) {
          const vk = getViewkey();
          if (!vk) throw new Error("无 viewkey");
          const sdPage = `${location.origin}/view_video.php?viewkey=${encodeURIComponent(vk)}`;
          const res = await gmGet(sdPage, {
            headers: { Referer: location.href, Accept: "text/html" },
          });
          mp4 = decodeStrencode2(res.responseText || "");
        }
        if (!mp4) throw new Error("未找到 strencode2 SD 源");
        finishMp4(root, mp4, silent ? "SD 兜底直链" : "SD 直链");
      } catch (e) {
        if (!silent) {
          setStatus(root, `SD 失败: ${e && e.message ? e.message : e}`, "err");
          toast(String(e.message || e), "err");
        }
        throw e;
      } finally {
        if (!silent) setBusy(btn, false);
      }
    }

    function enhanceSharePage() {
      injectSharedStyles();
      const pickSrc = () =>
        document.querySelector("video source")?.src ||
        document.querySelector("video")?.currentSrc ||
        document.querySelector("video")?.src ||
        null;

      const tryEnhance = () => {
        const src = pickSrc();
        if (!src || document.getElementById(`${NS}-root`)) return !!src;
        const root = makePanel({
          ns: NS,
          theme: "blue",
          title: "分享页直链",
          subtitle: "已从播放器提取",
          bodyHtml: `
            <div class="nsfw-dp-row">
              <button type="button" class="nsfw-btn" data-act="copy">复制直链</button>
              <button type="button" class="nsfw-btn secondary" data-act="pip">画中画</button>
              <a class="nsfw-btn" data-open href="${escapeHtml(src)}" target="_blank" rel="noopener">新标签</a>
              <a class="nsfw-btn secondary" data-download href="${escapeHtml(src)}" download>下载</a>
            </div>
            <div class="nsfw-dp-row">
              <input class="nsfw-url" data-url readonly value="${escapeHtml(src)}" />
            </div>
            <div class="nsfw-dp-status ok" data-status>可复制到 mpv / VLC 播放。</div>
            <video class="nsfw-vid show" controls playsinline data-video src="${escapeHtml(src)}"></video>
          `,
        });
        document.body.insertBefore(root, document.body.firstChild);
        bindUrlInput(root);
        root.addEventListener("click", (ev) => {
          const t = ev.target.closest("[data-act]");
          if (!t) return;
          if (t.getAttribute("data-act") === "copy") {
            ev.preventDefault();
            doCopy(root);
          } else if (t.getAttribute("data-act") === "pip") {
            ev.preventDefault();
            doPip(root);
          }
        });
        toast("分享页直链已提取", "info");
        return true;
      };

      if (tryEnhance()) return;
      let n = 0;
      const timer = setInterval(() => {
        n += 1;
        if (tryEnhance() || n > 50) clearInterval(timer);
      }, 200);
    }

    function showRoot(root) {
      root.style.display = "";
      root.classList.remove("collapsed");
      prefSet(`${NS}_collapsed`, false);
      const cb = root.querySelector('[data-act="collapse"]');
      if (cb) cb.textContent = "▾";
      root.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // 列表页：悬停预览无，只在详情/分享页工作
    if (isSharePage()) {
      enhanceSharePage();
      return;
    }
    if (!isViewPage()) return;

    const root = ensureRoot();

    root.addEventListener("click", (ev) => {
      const t = ev.target.closest("[data-act]");
      if (!t || !root.contains(t)) return;
      const act = t.getAttribute("data-act");
      if (act === "load") {
        ev.preventDefault();
        loadHd(root);
      } else if (act === "sd") {
        ev.preventDefault();
        loadSd(root).catch(() => {});
      } else if (act === "copy") {
        ev.preventDefault();
        doCopy(root);
      } else if (act === "pip") {
        ev.preventDefault();
        doPip(root);
      }
    });

    makeFloat({
      id: `${NS}-float`,
      label: "HD 直链",
      theme: "blue",
      onClick: () => {
        showRoot(root);
        loadHd(root);
      },
    });

    bindHotkeys((e) => {
      if (!isSp2026()) return;
      if (e.code === "KeyD") {
        e.preventDefault();
        showRoot(root);
        loadHd(root);
      } else if (e.code === "KeyS") {
        e.preventDefault();
        loadSd(root).catch(() => {});
      } else if (e.code === "KeyC") {
        e.preventDefault();
        doCopy(root);
      } else if (e.code === "KeyP") {
        e.preventDefault();
        doPip(root);
      }
    });

    // 普通详情页也默认自动拉 HD（可关）
    const auto =
      root.querySelector('[data-opt="autoplay"]')?.checked ??
      prefGet("sp_autoplay", true);
    if (auto) {
      loadHd(root);
    } else {
      setStatus(
        root,
        isHdPage()
          ? "高清页：点「获取并播放 HD」解码分享链。"
          : "详情页：可直接取 HD，或 SD 兜底。"
      );
    }
  }

  // ─── 入口 ─────────────────────────────────────────────────
  if (is3go()) run3go();
  else if (isSp2026()) runSp2026();
})();

/* =====================================================================
 * 模块 2/5：*王论坛 - 免币看视频 (mobile API) v1.1.0
 * ===================================================================== */

(function () {
  'use strict';

  if (!/(^|\.)laowang|opk\d*\.vip$/i.test(location.hostname) && !/laowang/i.test(location.hostname)) {
    return;
  }

  const PANEL_ID = 'lw-free-video-panel';
  const STYLE_ID = 'lw-free-video-style';

  function absUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('//')) return location.protocol + path;
    if (path.startsWith('/')) return location.origin + path;
    return location.origin + '/' + path.replace(/^\.\//, '');
  }

  function getTid() {
    const u = new URL(location.href);
    let m = u.searchParams.get('tid');
    if (m && /^\d+$/.test(m)) return m;
    m = location.pathname.match(/(?:thread-|tid-)(\d+)/i);
    if (m) return m[1];
    m = location.href.match(/[?&]tid=(\d+)/i);
    return m ? m[1] : null;
  }

  function hasDcSellLock() {
    const html = document.documentElement.innerHTML;
    return (
      html.includes('dc_locked') ||
      html.includes('dc_sell:pay') ||
      html.includes('dc_pay_button') ||
      /本付费内容需要支付/.test(html)
    );
  }

  function extractPlayIds(text) {
    if (!text) return [];
    const ids = new Set();
    const patterns = [
      /\/remote_play\/video\/play\/(\d+)/gi,
      /\/remote_play\/index\.php\/play\/ajax\/(\d+)/gi,
      /play\/ajax\/(\d+)\.html/gi,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(text))) ids.add(m[1]);
    }
    const iframeRe = /src=["']([^"']*remote_play[^"']+)["']/gi;
    let im;
    while ((im = iframeRe.exec(text))) {
      const m2 = im[1].match(/(\d{3,})/);
      if (m2) ids.add(m2[1]);
    }
    return [...ids];
  }

  function extractDirectM3u8(text) {
    if (!text) return [];
    const out = new Set();
    let m;
    const re = /https?:\/\/[^\s"'<>]+m3u8[^\s"'<>]*/gi;
    while ((m = re.exec(text))) out.add(m[0].replace(/&amp;/g, '&'));
    const re2 = /\/remote_m3u8\/[^\s"'<>]+/gi;
    while ((m = re2.exec(text))) out.add(absUrl(m[0].replace(/&amp;/g, '&')));
    return [...out];
  }

  function gmFetch(url, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
      const headers = Object.assign(
        { Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest' },
        opts.headers || {}
      );
      if (url.startsWith(location.origin) || url.startsWith('/')) {
        const u = url.startsWith('/') ? location.origin + url : url;
        fetch(u, {
          method: opts.method || 'GET',
          credentials: 'include',
          headers,
          body: opts.body || null,
        })
          .then(async (r) => resolve({ status: r.status, text: await r.text() }))
          .catch(reject);
        return;
      }
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: opts.method || 'GET',
          url,
          headers,
          data: opts.body || null,
          onload(res) {
            resolve({ status: res.status, text: res.responseText || '' });
          },
          onerror(err) {
            reject(err);
          },
        });
      } else {
        reject(new Error('no fetch'));
      }
    });
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css =
      '#' +
      PANEL_ID +
      '{position:fixed;z-index:2147483646;right:16px;bottom:16px;width:min(420px,calc(100vw - 24px));max-height:min(70vh,640px);overflow:auto;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.45);font:13px/1.45 system-ui,sans-serif}' +
      '#' +
      PANEL_ID +
      ' .hd{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#1f2937;border-bottom:1px solid #374151;position:sticky;top:0}' +
      '#' +
      PANEL_ID +
      ' .hd b{font-size:13px}' +
      '#' +
      PANEL_ID +
      ' .hd .btns{display:flex;gap:6px}' +
      '#' +
      PANEL_ID +
      ' button,#' +
      PANEL_ID +
      ' a.btn{appearance:none;border:0;border-radius:8px;padding:6px 10px;cursor:pointer;background:#2563eb;color:#fff;text-decoration:none;font-size:12px}' +
      '#' +
      PANEL_ID +
      ' button.sec{background:#374151}' +
      '#' +
      PANEL_ID +
      ' button:disabled{opacity:.5;cursor:not-allowed}' +
      '#' +
      PANEL_ID +
      ' .bd{padding:10px 12px}' +
      '#' +
      PANEL_ID +
      ' .muted{color:#9ca3af;font-size:12px}' +
      '#' +
      PANEL_ID +
      ' .err{color:#fca5a5}' +
      '#' +
      PANEL_ID +
      ' .ok{color:#86efac}' +
      '#' +
      PANEL_ID +
      ' .card{border:1px solid #374151;border-radius:10px;padding:10px;margin:8px 0;background:#0b1220}' +
      '#' +
      PANEL_ID +
      ' .card h4{margin:0 0 6px;font-size:13px;color:#93c5fd}' +
      '#' +
      PANEL_ID +
      ' .row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
      '#' +
      PANEL_ID +
      ' .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;word-break:break-all}' +
      '#' +
      PANEL_ID +
      ' video{width:100%;max-height:220px;background:#000;border-radius:8px;margin-top:8px}' +
      '#' +
      PANEL_ID +
      '.min .bd{display:none}' +
      '#' +
      PANEL_ID +
      '.min{width:auto}';
    if (typeof GM_addStyle === 'function') GM_addStyle(css);
    else {
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = css;
      document.head.appendChild(s);
    }
  }

  function panel() {
    let el = document.getElementById(PANEL_ID);
    if (el) return el;
    ensureStyle();
    el = document.createElement('div');
    el.id = PANEL_ID;
    el.innerHTML =
      '<div class="hd"><b>免金币看视频</b><div class="btns">' +
      '<button type="button" class="sec" data-act="min">收起</button>' +
      '<button type="button" class="sec" data-act="close">关闭</button></div></div>' +
      '<div class="bd"><div class="muted" data-role="meta">初始化…</div>' +
      '<div class="row" style="margin-top:8px">' +
      '<button type="button" data-act="run">拉取并播放</button>' +
      '<button type="button" class="sec" data-act="rerun">强制刷新</button></div>' +
      '<div data-role="list"></div></div>';
    document.documentElement.appendChild(el);
    el.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'close') el.remove();
      if (act === 'min') el.classList.toggle('min');
      if (act === 'run' || act === 'rerun') run({ force: act === 'rerun' });
    });
    return el;
  }

  function setMeta(html, isErr) {
    const el = panel().querySelector('[data-role="meta"]');
    el.className = isErr ? 'err' : 'muted';
    el.innerHTML = html;
  }

  function copyText(text) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
      return Promise.resolve(true);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return false; });
    }
    return Promise.resolve(false);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  async function fetchMobileThread(tid) {
    const url = '/api/mobile/index.php?version=4&module=viewthread&tid=' + encodeURIComponent(tid);
    const res = await gmFetch(url);
    if (res.status !== 200) throw new Error('mobile API HTTP ' + res.status);
    var data;
    try {
      data = JSON.parse(res.text);
    } catch (e) {
      throw new Error('mobile API 非 JSON（可能被防火墙拦截）');
    }
    var vars = data.Variables || data.variables || {};
    var posts = vars.postlist || vars.postList || [];
    var messages = posts.map(function (p) { return p.message || p.content || ''; }).filter(Boolean);
    var blob = messages.join('\n') + '\n' + res.text;
    return {
      data: data,
      subject: (vars.thread && (vars.thread.subject || vars.thread.title)) || document.title,
      messages: messages,
      blob: blob,
    };
  }

  async function fetchPlayAjax(playId) {
    const url = '/remote_play/index.php/play/ajax/' + encodeURIComponent(playId) + '.html';
    const res = await gmFetch(url);
    if (res.status !== 200) throw new Error('play ajax HTTP ' + res.status);
    try {
      return JSON.parse(res.text);
    } catch (e) {
      throw new Error('play ajax 非 JSON');
    }
  }

  function renderItem(container, item) {
    const card = document.createElement('div');
    card.className = 'card';
    const title = item.title || ('play #' + item.id);
    const playPage = absUrl('/remote_play/video/play/' + item.id + '.html');
    const m3u8 = item.m3u8 || '';
    const dl = item.download ? absUrl(item.download) : '';
    card.innerHTML =
      '<h4>' + escapeHtml(title) + '</h4>' +
      '<div class="mono muted">id=' + escapeHtml(String(item.id)) + '</div>' +
      (m3u8 ? '<div class="mono" style="margin-top:6px">' + escapeHtml(m3u8) + '</div>' : '') +
      '<div class="row">' +
      '<a class="btn" href="' + playPage + '" target="_blank" rel="noopener">打开播放页</a>' +
      (m3u8 ? '<button type="button" data-copy="' + escapeAttr(m3u8) + '">复制 m3u8</button>' : '') +
      (dl ? '<a class="btn sec" href="' + escapeAttr(dl) + '" target="_blank" rel="noopener">下载页</a>' : '') +
      (m3u8 ? '<button type="button" class="sec" data-playsrc="' + escapeAttr(m3u8) + '">本页试播</button>' : '') +
      '</div><div data-vhost></div>';
    card.addEventListener('click', async function (e) {
      const c = e.target.closest('[data-copy]');
      if (c) {
        const ok = await copyText(c.getAttribute('data-copy'));
        c.textContent = ok ? '已复制' : '复制失败';
        setTimeout(function () { c.textContent = '复制 m3u8'; }, 1200);
      }
      const p = e.target.closest('[data-playsrc]');
      if (p) {
        const host = card.querySelector('[data-vhost]');
        host.innerHTML =
          '<video controls autoplay playsinline src="' + escapeAttr(p.getAttribute('data-playsrc')) + '"></video>' +
          '<div class="muted">若无法播，多半是 AES 分片/跨域；请用播放页或把 m3u8 丢给 PotPlayer/mpv。</div>';
      }
    });
    container.appendChild(card);
  }

  var running = false;
  async function run() {
    if (running) return;
    running = true;
    const p = panel();
    const list = p.querySelector('[data-role="list"]');
    const btn = p.querySelector('[data-act="run"]');
    btn.disabled = true;
    list.innerHTML = '';
    try {
      const tid = getTid();
      if (!tid) {
        setMeta('当前页解析不到 tid（请在帖子页使用）', true);
        return;
      }
      const locked = hasDcSellLock();
      setMeta(
        'tid=<b>' + tid + '</b> ' +
          (locked
            ? '<span class="ok">检测到付费锁，正在走 mobile API…</span>'
            : '<span class="muted">未检测到锁，仍尝试 mobile API…</span>')
      );

      const mt = await fetchMobileThread(tid);
      const playIds = extractPlayIds(mt.blob);
      const direct = extractDirectM3u8(mt.blob);

      if (!playIds.length && !direct.length) {
        setMeta(
          'tid=' + tid + ' mobile API 已返回，但未找到 remote_play / m3u8。<br>' +
            '这通常是 <b>jnpar 网盘帖</b>（mobile 不吐链），不是 dc_sell 视频帖。',
          true
        );
        return;
      }

      setMeta(
        '标题：' + escapeHtml(mt.subject || '') + '<br>' +
          '找到 play id：<b>' + (playIds.join(', ') || '无') + '</b>；直接 m3u8：<b>' + direct.length + '</b>'
      );

      for (var i = 0; i < direct.length; i++) {
        renderItem(list, { id: 'm3u8', title: '直接 m3u8', m3u8: direct[i] });
      }

      for (var j = 0; j < playIds.length; j++) {
        var id = playIds[j];
        try {
          var info = await fetchPlayAjax(id);
          var playlink = info.playlink || info.url || info.m3u8 || '';
          renderItem(list, {
            id: id,
            title: info.title || info.name || ('视频 ' + id),
            m3u8: playlink ? absUrl(playlink) : '',
            download: info.download || info.down || '',
          });
        } catch (e) {
          var card = document.createElement('div');
          card.className = 'card';
          card.innerHTML =
            '<h4>play ' + escapeHtml(id) + '</h4><div class="err">' + escapeHtml(e.message || e) + '</div>' +
            '<div class="row"><a class="btn" target="_blank" rel="noopener" href="' +
            absUrl('/remote_play/video/play/' + id + '.html') +
            '">仍打开播放页</a></div>';
          list.appendChild(card);
        }
      }
    } catch (e) {
      setMeta(escapeHtml(e.message || String(e)), true);
    } finally {
      running = false;
      btn.disabled = false;
    }
  }

  function shouldAuto() {
    return !!(getTid() && (hasDcSellLock() || /mod=viewthread|thread-\d+/i.test(location.href)));
  }

  function boot() {
    if (!getTid()) return;
    panel();
    if (shouldAuto()) setTimeout(function () { run(); }, 600);
    else setMeta('tid=<b>' + getTid() + '</b>。点击「拉取并播放」使用 mobile API。');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  var last = location.href;
  setInterval(function () {
    if (location.href !== last) {
      last = location.href;
      if (getTid()) boot();
    }
  }, 1200);
})();

/* =====================================================================
 * 模块 3/5：J*vhub 无限观看 + 下载 v1.0.0 【已加站点守卫】
 * ===================================================================== */

/* ============================================================================
 * 逆向结论（来自对 javhub.net 的实际逆向）:
 *  - 每个 /play/<id>/<slug> 页面的 HTML 里直接内嵌完整视频签名直链:
 *      <video src="https://<cdn>.2babes.com|anyhentai.com/mp4/<md5>.mp4?md5=<token>&expires=<unix>">
 *    签名参数为 md5 token + 过期时间（约 6 小时），服务器每次生成新签名。
 *  - CDN(2babes/anyhentai) 不在 Cloudflare 后面，只校验 Referer 指向 javhub.net，
 *    支持 HTTP Range（可断点续传），无 CORS、无 Content-Disposition。
 *  - 观看计数由服务端按访客 cookie `_var`（httpOnly，按 IP 生成）在 POST /playapi 时统计；
 *    播放页每次加载都会派发全新签名 URL，因此“无限观看”= 每页刷新即有新配额/新源。
 *  - 免费下载 = 直接抓取页内签名的 mp4 源码（全片、多清晰度见 jwplayer playlist）。
 *  本脚本因此启用 GM_xmlhttpRequest（绕过 CORS、可带 Referer）实现流式下载，
 *  并用 GM_cookie 旋转身份应对服务端观看限额页。
 * ==========================================================================*/

(() => {
  "use strict";
  // [merged] 站点守卫：仅 javhub.net 播放页生效
  if (!/(^|\.)javhub\.net$/i.test(location.hostname) || !location.pathname.startsWith("/play/")) return;


  const SELF_ORIGIN = location.origin;
  const CDN_RE = /^(?:https?:)?\/\/[0-9a-z.-]*(?:2babes|anyhentai)[^"'\s]*/i;

  /* ---------------- 工具 ---------------- */

  function parseSignedUrl(u) {
    // 解析签名 URL 的 expires 与剩余时长
    try {
      const m = u.match(/[?&]expires=(\d+)/i);
      if (!m) return null;
      const exp = parseInt(m[1], 10) * 1000;
      const remain = exp - Date.now();
      return { expires: exp, remainMs: remain, expired: remain <= 0 };
    } catch (e) { return null; }
  }

  function fmtSize(n) {
    if (!n) return "?";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(n >= 100 || i === 0 ? 0 : 1) + " " + u[i];
  }

  function fmtTime(ms) {
    if (ms <= 0) return "已过期";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
  }

  /* ---------------- 取源 ---------------- */

  function collectSources() {
    // 1) <video> 元素
    const out = [];
    const v = document.querySelector("video");
    if (v) {
      const src = v.currentSrc || v.getAttribute("src") || "";
      if (src && CDN_RE.test(src)) out.push({ url: src, label: "当前" });
      // <source> 子元素
      document.querySelectorAll("video source").forEach(s => {
        const su = s.src || s.getAttribute("src");
        if (su && CDN_RE.test(su) && !out.some(o => o.url === su)) {
          out.push({ url: su, label: (s.getAttribute("label") || s.getAttribute("res") || "来源") });
        }
      });
    }
    // 2) jwplayer playlist（多清晰度时列出全部）
    try {
      if (typeof jwplayer === "function") {
        const jw = jwplayer();
        const pl = jw && jw.getPlaylist ? jw.getPlaylist() : null;
        const all = pl && pl[0] ? (pl[0].allSources || pl[0].sources || []) : [];
        all.forEach((s, i) => {
          if (s && s.file && CDN_RE.test(s.file) && !out.some(o => o.url === s.file)) {
            out.push({ url: s.file, label: s.label && s.label !== "0" ? s.label : (`清晰度 ${i + 1}`) });
          }
        });
      }
    } catch (e) {}
    // 3) 页面 HTML 兜底
    if (!out.length) {
      const m = document.documentElement.outerHTML.match(CDN_RE);
      if (m) out.push({ url: m[0].replace(/&amp;/g, "&"), label: "嵌入" });
    }
    return out;
  }

  function setPlayerSrc(url) {
    // 原地换源（不刷新页面）
    const v = document.querySelector("video");
    if (v) { v.src = url; v.load(); try { v.play().catch(() => {}); } catch (e) {} }
    try {
      if (typeof jwplayer === "function") {
        const jw = jwplayer();
        if (jw && jw.load) jw.load({ file: url });
        else if (jw && jw.setup) jw.setup({ playlist: [{ sources: [{ file: url, type: "mp4" }] }] });
      }
    } catch (e) {}
  }

  /* ---------------- 重取源（不刷新页面，续约签名 URL） ---------------- */

  function refetchSource() {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: location.href,
        headers: { "Referer": SELF_ORIGIN + "/", "X-Requested-With": "XMLHttpRequest" },
        timeout: 30000,
        onload: (res) => {
          try {
            const html = res.responseText;
            const m = html.match(/https:\/\/[0-9a-z.-]*(?:2babes|anyhentai)[^"'\s&]*\.mp4\?[^"'\s&]*/i);
            resolve(m ? m[0].replace(/&amp;/g, "&") : null);
          } catch (e) { resolve(null); }
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  /* ---------------- 下载（流式分块写盘） ---------------- */

  const CHUNK = 16 * 1024 * 1024; // 16MB / 块

  async function streamDownload(url, filename, preWriter, onProgress) {
    // 1) HEAD 拿总大小
    const size = await new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "HEAD", url,
        headers: { "Referer": SELF_ORIGIN + "/" },
        onload: (r) => {
          const cl = r.responseHeaders.match(/content-length:\s*(\d+)/i);
          resolve(cl ? parseInt(cl[1], 10) : 0);
        },
        onerror: () => resolve(0), ontimeout: () => resolve(0), timeout: 30000,
      });
    });

    // 2) 写盘句柄：优先使用点击手势内预取的 File System Access API 句柄
    let writer = preWriter, parts = null;
    if (!writer) parts = []; // Firefox 兜底：内存分片

    let done = 0;
    const total = Math.max(size, 1);

    const fetchRange = (start, end) => new Promise((resolveChunk, rejectChunk) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        headers: {
          "Referer": SELF_ORIGIN + "/",
          "Range": `bytes=${start}-${end > 0 ? end : ""}`,
        },
        responseType: "blob",
        timeout: 120000,
        onload: (r) => {
          if (r.status === 200 || r.status === 206) resolveChunk(r.response);
          else rejectChunk(new Error("HTTP " + r.status));
        },
        onerror: () => rejectChunk(new Error("网络错误")),
        ontimeout: () => rejectChunk(new Error("超时")),
      });
    });

    try {
      while (done < total) {
        const end = Math.min(done + CHUNK - 1, total - 1);
        let blob;
        try {
          blob = await fetchRange(done, end);
        } catch (e) {
          await new Promise(r => setTimeout(r, 3000)); // 网络抖动重试
          blob = await fetchRange(done, end);
        }
        if (writer) await writer.write(blob);
        else parts.push(blob);
        done += blob.size;
        onProgress(done, total);
      }
      if (writer) await writer.close();
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(parts, { type: "video/mp4" }));
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 120000);
      }
      return true;
    } catch (e) {
      if (writer) { try { await writer.abort(); } catch (_) {} }
      throw e;
    }
  }

  /* ---------------- UI ---------------- */

  function buildPanel(sources) {
    GM_addStyle(`
      #jhx-panel{position:fixed;top:90px;right:12px;z-index:2147483646;width:300px;
        background:#14161c;color:#e8e8e8;border:1px solid #775cdc;border-radius:10px;
        font:13px/1.5 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.55);overflow:hidden}
      #jhx-panel .jhx-head{padding:8px 12px;background:#775cdc;color:#fff;font-weight:700;cursor:move;
        display:flex;justify-content:space-between;align-items:center}
      #jhx-panel .jhx-body{padding:10px 12px}
      #jhx-panel .jhx-row{display:flex;gap:8px;align-items:center;margin:6px 0}
      #jhx-panel button{border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font-weight:600}
      #jhx-panel .jhx-btn-dl{background:#28a745;color:#fff;flex:1}
      #jhx-panel .jhx-btn-dl:disabled{background:#5a5f6a;cursor:wait}
      #jhx-panel .jhx-btn2{background:#343a46;color:#e8e8e8}
      #jhx-panel select{flex:1;background:#262a34;color:#e8e8e8;border:1px solid #444;border-radius:6px;padding:4px}
      #jhx-panel .jhx-bar{height:8px;background:#262a34;border-radius:4px;overflow:hidden;margin-top:6px}
      #jhx-panel .jhx-bar>div{height:100%;background:#28a745;width:0}
      #jhx-panel .jhx-meta{color:#9aa0ab;font-size:12px;margin-top:6px;word-break:break-all}
      #jhx-panel .jhx-err{color:#ff6b6b;font-size:12px;margin-top:6px}
      #jhx-panel .jhx-ok{color:#51cf66;font-size:12px;margin-top:6px}
    `);

    const panel = document.createElement("div");
    panel.id = "jhx-panel";
    panel.innerHTML = `
      <div class="jhx-head"><span>J*vhub 无限观看+下载</span><span style="cursor:pointer" id="jhx-min">—</span></div>
      <div class="jhx-body">
        <div class="jhx-row">
          <select id="jhx-src"></select>
        </div>
        <div class="jhx-row">
          <button id="jhx-dl" class="jhx-btn-dl">⬇ 下载所选</button>
          <button id="jhx-copy" class="jhx-btn2">复制</button>
          <button id="jhx-refresh" class="jhx-btn2">换源</button>
        </div>
        <div class="jhx-row"><button id="jhx-play" class="jhx-btn2" style="flex:1">▶ 强制播放</button></div>
        <div class="jhx-bar"><div id="jhx-barfill"></div></div>
        <div class="jhx-meta" id="jhx-meta"></div>
        <div class="jhx-err" id="jhx-err"></div>
        <div class="jhx-ok" id="jhx-ok"></div>
      </div>`;
    document.body.appendChild(panel);

    const $ = (id) => panel.querySelector(id);
    const sel = $("#jhx-src");
    sources.forEach((s, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = `${s.label} — ${fmtSize(s.size || 0)}`;
      sel.appendChild(o);
    });
    // 默认选中当前播放的那条
    const cur = (document.querySelector("video") || {}).currentSrc || (document.querySelector("video") || {}).src || "";
    if (cur) {
      const i = sources.findIndex(s => s.url === cur);
      if (i >= 0) sel.value = String(i);
    }

    // 异步补全各源的文件大小（HEAD Content-Length）
    sources.forEach((s, i) => {
      GM_xmlhttpRequest({
        method: "HEAD",
        url: s.url,
        headers: { "Referer": SELF_ORIGIN + "/" },
        timeout: 20000,
        onload: (r) => {
          const cl = r.responseHeaders.match(/content-length:\s*(\d+)/i);
          if (cl) {
            s.size = parseInt(cl[1], 10);
            const o = sel.options[i];
            if (o) o.textContent = `${s.label} — ${fmtSize(s.size)}`;
            if (i === parseInt(sel.value, 10)) renderMeta();
          }
        },
      });
    });

    const meta = $("#jhx-meta");
    function renderMeta() {
      const srcs = collectSources();
      const s = srcs[parseInt(sel.value, 10)] || srcs[0];
      if (!s) { meta.textContent = "未检测到视频源"; return; }
      const p = parseSignedUrl(s.url);
      meta.innerHTML = `文件: <b>${s.url.split("/").pop().split("?")[0]}</b><br>` +
        `大小: <b>${fmtSize(s.size)}</b> &nbsp; 签名剩余: <b id="jhx-exp">${p ? fmtTime(p.remainMs) : "?"}</b>`;
      const exp = $("#jhx-exp");
      if (exp && p) {
        const t = setInterval(() => {
          const pp = parseSignedUrl(s.url);
          exp.textContent = pp ? fmtTime(pp.remainMs) : "?";
          if (pp && pp.expired) clearInterval(t);
        }, 1000);
      }
    }
    renderMeta();
    sel.addEventListener("change", renderMeta);

    // 拖动
    let drag = false;
    panel.querySelector(".jhx-head").addEventListener("mousedown", (e) => {
      drag = true;
      const dx = e.clientX - panel.getBoundingClientRect().left;
      const dy = e.clientY - panel.getBoundingClientRect().top;
      const mm = (ev) => {
        if (!drag) return;
        panel.style.left = (ev.clientX - dx) + "px";
        panel.style.top = (ev.clientY - dy) + "px";
        panel.style.right = "auto";
      };
      const mu = () => { drag = false; window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
      window.addEventListener("mousemove", mm);
      window.addEventListener("mouseup", mu);
    });
    $("#jhx-min").addEventListener("click", () => {
      panel.querySelector(".jhx-body").style.display =
        panel.querySelector(".jhx-body").style.display === "none" ? "" : "none";
    });

    // 下载
    $("#jhx-dl").addEventListener("click", async () => {
      const srcs = collectSources();
      const s = srcs[parseInt(sel.value, 10)] || srcs[0];
      if (!s) { $("#jhx-err").textContent = "未检测到视频源"; return; }
      const btn = $("#jhx-dl");
      btn.disabled = true;
      btn.textContent = "下载中…";
      $("#jhx-err").textContent = "";
      const title = (document.title.split("|")[0] || "video").trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 100);
      const fn = (title + "_" + s.url.split("/").pop().split("?")[0]).replace(/&/g, "_");
      // 必须在用户手势内同步弹出保存对话框（异步后会失去用户激活）
      let writer = null;
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fn,
            types: [{ description: "MP4 视频", accept: { "video/mp4": [".mp4"] } }],
          });
          writer = await handle.createWritable();
        } catch (e) {
          $("#jhx-err").textContent = "已取消选择保存位置";
          btn.disabled = false;
          btn.textContent = "⬇ 下载所选";
          return;
        }
      }
      $("#jhx-ok").textContent = writer ? "开始流式下载…" : "Firefox 模式：将在完成后弹出保存（大文件请谨慎）";
      try {
        const ok = await streamDownload(s.url, fn, writer, (done, total) => {
          $("#jhx-barfill").style.width = (done / Math.max(total, 1) * 100).toFixed(1) + "%";
          $("#jhx-meta").innerHTML = `下载中 … ${fmtSize(done)} / ${fmtSize(total)}`;
        });
        if (ok) {
          $("#jhx-barfill").style.width = "100%";
          $("#jhx-ok").textContent = "✅ 下载完成（已保存为 " + fn + "）";
          GM_notification({ title: "J*vhub 下载完成", text: fn, timeout: 5000 });
        }
      } catch (e) {
        $("#jhx-err").textContent = "下载失败: " + e.message +
          "（大文件请保持浏览器前台并检查磁盘空间）";
      }
      btn.disabled = false;
      btn.textContent = "⬇ 下载所选";
    });

    // 复制链接
    $("#jhx-copy").addEventListener("click", () => {
      const srcs = collectSources();
      const s = srcs[parseInt(sel.value, 10)] || srcs[0];
      if (!s) return;
      GM_setClipboard(s.url);
      $("#jhx-ok").textContent = "已复制签名直链（约 6 小时内有效）";
    });

    // 换源 / 续约
    $("#jhx-refresh").addEventListener("click", async () => {
      $("#jhx-refresh").disabled = true;
      $("#jhx-ok").textContent = "正在重新获取签名源…";
      const u = await refetchSource();
      if (u) {
        setPlayerSrc(u);
        $("#jhx-ok").textContent = "✅ 已原地换源并续约签名（无需刷新页面）";
        setTimeout(renderMeta, 800);
      } else {
        $("#jhx-err").textContent = "换源失败（可能已触发观看限制页）";
      }
      $("#jhx-refresh").disabled = false;
    });

    // 强制播放（浏览器自动播放策略拦截时）
    $("#jhx-play").addEventListener("click", () => {
      const v = document.querySelector("video");
      if (v) { v.currentTime = v.currentTime || 0; v.muted = false; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
      try { if (typeof jwplayer === "function") jwplayer().play(); } catch (e) {}
      $("#jhx-ok").textContent = "已尝试强制播放";
    });
  }

  /* ---------------- 观看限制的自动恢复 ---------------- */

  function isPaywallPage() {
    // 付费页/限制页特征：无视频源 + 出现推广文案
    const v = document.querySelector("video");
    if (v && (v.currentSrc || v.getAttribute("src"))) return false;
    const body = (document.body ? document.body.innerText : "") || "";
    return /premium|membership|unlimited watch|video download|pricing/i.test(body.slice(0, 4000));
  }

  function rotateIdentity() {
    // 服务端按 _var cookie（httpOnly）统计访客观看数；GM_cookie 可绕过 httpOnly 限制。
    // 返回是否成功旋转。
    return new Promise((resolve) => {
      if (typeof GM_cookie === "undefined" || !GM_cookie.list) return resolve(false);
      GM_cookie.list({ domain: "javhub.net" }, (cookies, err) => {
        if (err) return resolve(false);
        const v = (cookies || []).find(c => c.name === "_var");
        const prefix = v ? v.value.split("_")[0] + "_" : "";
        // 生成与站点格式一致的尾段：8 位 hex 的 base64
        const hex = Array.from({ length: 8 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
        const tail = btoa(hex);
        const cleanup = [];
        const set = () => new Promise((res) => {
          GM_cookie.set({ domain: "javhub.net", path: "/", name: "_var", value: prefix + tail,
                          expires: Math.floor(Date.now() / 1000) + 86400 * 30 }, (e2) => res(!e2));
        });
        if (v) {
          GM_cookie.delete({ domain: "javhub.net", name: "_var" }, (e1) => {
            void e1;
            set().then(resolve);
          });
        } else {
          set().then(resolve);
        }
      });
    });
  }

  function autoRecover() {
    if (!isPaywallPage()) return;
    const tag = document.querySelector("#jhx-ok");
    if (tag) tag.textContent = "检测到观看限制页，正在自动恢复…";

    refetchSource().then(async (u) => {
      if (u) {
        setPlayerSrc(u);
        if (tag) tag.textContent = "✅ 已自动恢复播放（新签名源）";
        return;
      }
      // 换源不行 → 旋转 _var 身份后整页刷新
      const ok = await rotateIdentity();
      if (tag) tag.textContent = ok ? "已旋转访客身份，刷新页面…" : "身份旋转不可用，等待服务端恢复";
      setTimeout(() => {
        if (isPaywallPage()) location.reload();
      }, 1500);
    });
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    // 等播放器挂载源
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const srcs = collectSources();
      if ((srcs.length || tries > 20) && document.body) {
        clearInterval(t);
        if (!document.querySelector("#jhx-panel")) buildPanel(srcs);
      }
    }, 500);

    // 观看限制自动恢复（每 4 秒巡检）
    setInterval(autoRecover, 4000);
    setTimeout(autoRecover, 3000);

    // 自动尝试播放（消除“点一下开始”）
    setTimeout(() => {
      const v = document.querySelector("video");
      if (v && v.paused) { v.play().catch(() => {}); }
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* =====================================================================
 * 模块 4/5：X*sian 免会员播放 v1.0.0
 * 原理：
 *   [V1] POST https://v2.cdn199.com/js 网关，body.url=/sevenVideos/<id>
 *        匿名（userId=null）直接返回付费视频完整 m3u8s[]，付费校验纯前端
 *   [V2] API 响应 AES 加密，密钥硬编码 "xxx"（前端 decrypt()）
 *   [V3] 本地会员态 CapacitorStorage.SevenVideoUser 用 AES 密钥
 *        "xxxxx" 加密，可离线伪造 activeUntil 实现客户端 VIP
 *   [V4] VIP 高速线路参数 line=default1/hd1/hd2/hd3 匿名可用
 * 注意：网关要求 Origin/Referer/UA 匹配，否则 403 {"blocked":true}
 * ===================================================================== */
(function () {
  "use strict";

  const NS = "xa-free";
  const API_HOST = "v2.cdn199.com";
  const API_PATH = "/js";
  const AES_KEY_API = "xxx";      // 接口响应加密密钥（前端硬编码）
  const AES_KEY_LOCAL = "xxxxx";  // 本地存储加密密钥（前端硬编码）
  const STORE_KEY = "CapacitorStorage.SevenVideoUser";

  const KNOWN_HOST_RE =
    /(^|\.)(xasian|xchina|91porn|91zpc|hstv|1024video|1024fans|yaoporn|asianhub|madou|caoliu|theporny|dirtychinese|111porn|pornfk|pilipili|dsdtube|pornshop|bdsmzoo|91\.wtf)\./i;

  function isKnownSite() {
    return KNOWN_HOST_RE.test(location.hostname);
  }

  function getApp() {
    return location.hostname.replace(/^www\./, "");
  }

  /* ---------------- 基础工具 ---------------- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg, kind, ms) {
    kind = kind || "ok";
    ms = ms || 2400;
    let host = document.getElementById("nsfw-dp-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "nsfw-dp-toast-host";
      document.documentElement.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = "nsfw-dp-toast " + kind;
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 280);
    }, ms);
  }

  function copyText(text) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof GM_setClipboard === "function") {
          GM_setClipboard(text);
          resolve();
          return;
        }
      } catch (_) {}
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(resolve, reject);
      } else {
        reject(new Error("no clipboard"));
      }
    });
  }

  /* ---------------- 网关调用 + AES 解密 ---------------- */

  function gmPost(url, body, extraHeaders) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("GM_xmlhttpRequest 不可用"));
        return;
      }
      GM_xmlhttpRequest({
        method: "POST",
        url: "https://" + API_HOST + API_PATH,
        headers: Object.assign(
          {
            "Content-Type": "application/json",
            Origin: location.origin,
            Referer: location.origin + "/",
            "User-Agent": navigator.userAgent,
            Accept: "application/json, text/plain, */*",
          },
          extraHeaders || {}
        ),
        data: JSON.stringify(body),
        timeout: 30000,
        onload(res) {
          if (res.status < 200 || res.status >= 400) {
            let msg = "HTTP " + res.status;
            try {
              const j = JSON.parse(res.responseText);
              if (j && j.message) msg += " · " + j.message;
              else if (j && j.error) msg += " · " + j.error;
            } catch (_) {}
            reject(new Error(msg));
            return;
          }
          try {
            resolve(JSON.parse(res.responseText));
          } catch (e) {
            reject(new Error("非 JSON 响应: " + res.responseText.slice(0, 120)));
          }
        },
        onerror: () => reject(new Error("网络错误")),
        ontimeout: () => reject(new Error("请求超时")),
      });
    });
  }

  function evpBytesToKey(pass, salt, keyLen, ivLen) {
    // EVP_BytesToKey: D_i = MD5(D_{i-1} || pass || salt)
    const d = [];
    let prev = CryptoJS.lib.WordArray.create([]);
    for (;;) {
      const h = CryptoJS.algo.MD5.create();
      h.update(prev);
      h.update(CryptoJS.enc.Utf8.parse(pass));
      h.update(CryptoJS.enc.Latin1.parse(salt.toString("latin1")));
      prev = h.finalize();
      d.push(prev);
      const total = d.reduce((a, w) => a + w.sigBytes, 0);
      if (total >= keyLen + ivLen) break;
    }
    const all = CryptoJS.lib.WordArray.create(
      [].concat(...d.map((w) => w.words)),
      keyLen + ivLen
    );
    return {
      key: CryptoJS.lib.WordArray.create(all.words.slice(0, keyLen / 4)),
      iv: CryptoJS.lib.WordArray.create(
        all.words.slice(keyLen / 4, (keyLen + ivLen) / 4)
      ),
    };
  }

  function aesDecrypt(cipherB64, pass) {
    // CryptoJS.OpenSSL 格式：Salted__ + salt + AES-256-CBC(PKCS7)
    const raw = atob(cipherB64);
    if (raw.slice(0, 8) !== "Salted__") throw new Error("非 Salted 密文");
    const salt = raw.slice(8, 16);
    const ct = raw.slice(16);
    const { key, iv } = evpBytesToKey(pass, salt, 32, 16);
    const dec = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Latin1.parse(ct) },
      key,
      { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    );
    return dec.toString(CryptoJS.enc.Utf8);
  }

  function aesEncrypt(plain, pass) {
    const enc = CryptoJS.AES.encrypt(plain, pass); // OpenSSL salted 格式
    return enc.toString();
  }

  function api(url, extra) {
    const body = Object.assign(
      {
        url,
        deviceInfo: {},
        app: getApp(),
        isStandalone: false,
        theLink: "novaluenull",
        uuid: "novalue",
      },
      extra || {}
    );
    return gmPost(API_PATH, body).then((j) => {
      if (!j || typeof j.r !== "string") throw new Error("网关响应异常");
      return JSON.parse(aesDecrypt(j.r, AES_KEY_API));
    });
  }

  /* ---------------- HLS 播放 ---------------- */

  let hlsInst = null;
  function playM3u8(video, url) {
    if (hlsInst) {
      try { hlsInst.destroy(); } catch (_) {}
      hlsInst = null;
    }
    video.style.display = "block";
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
      return;
    }
    if (typeof Hls === "undefined") {
      toast("本浏览器不支持 HLS，请用「复制」+外部播放器", "err");
      return;
    }
    hlsInst = new Hls();
    hlsInst.loadSource(url);
    hlsInst.attachMedia(video);
    hlsInst.on(Hls.Events.ERROR, (_e, data) => {
      if (data && data.fatal) toast("播放出错: " + data.type + " / " + data.details, "err");
    });
    video.play().catch(() => {});
  }

  /* ---------------- 面板 UI（复用 nsfw-dp 样式） ---------------- */

  function injectStyles() {
    if (document.getElementById("nsfw-dp-shared-style")) return;
    GM_addStyle(`
      #nsfw-dp-toast-host {
        position: fixed; z-index: 2147483646;
        right: 16px; bottom: 72px;
        display: flex; flex-direction: column; gap: 8px;
        pointer-events: none; max-width: min(420px, calc(100vw - 32px));
      }
      .nsfw-dp-toast {
        opacity: 0; transform: translateY(8px);
        transition: opacity .22s, transform .22s;
        padding: 10px 14px; border-radius: 10px;
        font: 600 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-shadow: 0 10px 28px rgba(0,0,0,.4);
        color: #0b1220; background: #86efac;
      }
      .nsfw-dp-toast.err { background: #fca5a5; }
      .nsfw-dp-toast.info { background: #93c5fd; }
      .nsfw-dp-toast.show { opacity: 1; transform: translateY(0); }

      .xa-panel {
        position: relative; z-index: 99990;
        margin: 12px 0 16px; padding: 0;
        border-radius: 14px; overflow: hidden;
        border: 1px solid #334155;
        background: linear-gradient(165deg, #1b2433 0%, #121820 100%);
        color: #e2e8f0;
        font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-shadow: 0 12px 32px rgba(0,0,0,.38);
        --xa-accent: #fbbf24; --xa-sec: #334155; --xa-muted: #94a3b8;
        --xa-input-bd: #475569; --xa-input-bg: #0b1220; --xa-ok: #86efac; --xa-err: #fca5a5;
      }
      .xa-hd {
        display: flex; align-items: center; gap: 10px;
        padding: 11px 14px; cursor: default;
        border-bottom: 1px solid rgba(51,65,85,.7); user-select: none;
      }
      .xa-hd h3 { margin: 0; flex: 1; min-width: 0; font-size: 15px; font-weight: 700; color: var(--xa-accent); }
      .xa-hd h3 small { font-weight: 500; font-size: 11px; opacity: .72; color: #e2e8f0; }
      .xa-hd .xa-tools { display: flex; gap: 6px; }
      .xa-iconbtn {
        appearance: none; border: 0; border-radius: 8px; width: 30px; height: 30px;
        cursor: pointer; font-size: 14px; line-height: 1;
        background: var(--xa-sec); color: #e2e8f0;
      }
      .xa-body { padding: 12px 14px 14px; }
      .xa-panel.collapsed .xa-body { display: none; }
      .xa-panel.collapsed .xa-hd { border-bottom: 0; }
      .xa-sub { margin: 0 0 10px; font-size: 12px; color: var(--xa-muted); }
      .xa-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
      .xa-panel button.xa-btn, .xa-panel a.xa-btn {
        appearance: none; border: 0; border-radius: 8px; padding: 8px 12px; cursor: pointer;
        font-weight: 650; font-size: 12px; text-decoration: none;
        color: #0f172a; background: var(--xa-accent);
        display: inline-flex; align-items: center; gap: 6px;
      }
      .xa-panel button.xa-btn.secondary, .xa-panel a.xa-btn.secondary {
        background: var(--xa-sec); color: #e2e8f0;
      }
      .xa-panel button.xa-btn:disabled { opacity: .55; cursor: wait; }
      .xa-panel button.xa-btn.busy::before {
        content: ""; width: 12px; height: 12px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,.35); border-top-color: #fff;
        animation: xa-spin .7s linear infinite;
      }
      @keyframes xa-spin { to { transform: rotate(360deg); } }
      .xa-panel select.xa-line, .xa-panel input.xa-url {
        border-radius: 8px; border: 1px solid var(--xa-input-bd);
        background: var(--xa-input-bg); color: #e2e8f0;
        padding: 8px 10px; font-size: 12px;
      }
      .xa-panel input.xa-url {
        flex: 1 1 260px; min-width: 0;
        font-family: ui-monospace, monospace;
      }
      .xa-status {
        font-size: 12px; color: var(--xa-muted);
        word-break: break-all; white-space: pre-wrap; min-height: 1.35em;
      }
      .xa-status.ok { color: var(--xa-ok); }
      .xa-status.err { color: var(--xa-err); }
      .xa-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; color: #e2e8f0; margin: 4px 0 2px; }
      .xa-meta b { color: var(--xa-accent); }
      .xa-panel video.xa-vid {
        display: none; width: 100%;
        max-height: min(70vh, 720px); margin-top: 10px;
        border-radius: 8px; background: #000;
      }
      .xa-panel video.xa-vid.show { display: block; }
      .xa-float {
        position: fixed; z-index: 100000;
        right: 16px; bottom: 70px;
        border: 0; border-radius: 999px;
        padding: 11px 16px; cursor: grab;
        font-weight: 750; font-size: 13px; color: #1c1917;
        background: linear-gradient(135deg, #fbbf24, #f59e0b);
        box-shadow: 0 8px 22px rgba(0,0,0,.4);
        user-select: none; touch-action: none;
      }
      .xa-float:hover { filter: brightness(1.06); }
      .xa-float.dragging { cursor: grabbing; opacity: .92; }
    `);
  }

  function buildPanel() {
    injectStyles();
    let root = document.getElementById(NS + "-root");
    if (root) return root;

    root = document.createElement("div");
    root.id = NS + "-root";
    root.className = "xa-panel";
    root.innerHTML = `
      <div class="xa-hd">
        <h3>X*sian 免会员直链<small>匿名取 m3u8 · 伪造本地 VIP</small></h3>
        <div class="xa-tools">
          <button type="button" class="xa-iconbtn" data-act="collapse" title="折叠/展开">▾</button>
          <button type="button" class="xa-iconbtn" data-act="hide" title="隐藏面板">✕</button>
        </div>
      </div>
      <div class="xa-body">
        <p class="xa-sub">网关 POST v2.cdn199.com/js · 响应 AES 密钥硬编码 "xxx" · 付费校验纯前端，匿名即可取完整 m3u8。</p>
        <div class="xa-row">
          <button type="button" class="xa-btn" data-act="load">获取直链并播放</button>
          <button type="button" class="xa-btn secondary" data-act="play" disabled>仅播放</button>
          <button type="button" class="xa-btn secondary" data-act="copy" disabled>复制</button>
          <button type="button" class="xa-btn secondary" data-act="dl" disabled>拼接下载</button>
          <button type="button" class="xa-btn secondary" data-act="forge">伪造会员态</button>
        </div>
        <div class="xa-meta" data-meta></div>
        <div class="xa-row">
          <select class="xa-line" data-line title="播放线路（VIP 高速线路匿名可用）">
            <option value="default1">default1 默认</option>
            <option value="hd1">hd1 高速</option>
            <option value="hd2">hd2 高速</option>
            <option value="hd3">hd3 高速</option>
          </select>
          <input class="xa-url" data-url type="text" readonly placeholder="m3u8 直链（双击复制）" />
        </div>
        <div class="xa-status" data-status>就绪。在详情页 /video/&lt;id&gt; 使用，或手动输入视频 ID。</div>
        <div class="xa-row">
          <input class="xa-url" data-vid type="text" placeholder="视频 ID（可选，如 HZxqbouILs）" style="flex:1 1 220px" />
        </div>
        <video class="xa-vid" controls playsinline preload="metadata" data-video></video>
      </div>
    `;

    // 挂载：插到页面主内容前
    const target =
      document.querySelector(".video-main, .video-detail, .player-section, main, #main") ||
      document.body;
    if (target && target !== document.body) {
      target.parentNode.insertBefore(root, target);
    } else {
      document.body.insertBefore(root, document.body.firstChild);
    }

    root.addEventListener("click", (ev) => {
      const t = ev.target.closest("[data-act]");
      if (!t || !root.contains(t)) return;
      const act = t.getAttribute("data-act");
      if (act === "collapse") {
        root.classList.toggle("collapsed");
        const cb = root.querySelector('[data-act="collapse"]');
        if (cb) cb.textContent = root.classList.contains("collapsed") ? "▸" : "▾";
      } else if (act === "hide") {
        root.style.display = "none";
        toast("面板已隐藏，点右下角浮钮重新打开", "info");
      } else if (act === "load") {
        doLoad({ play: true });
      } else if (act === "play") {
        doPlay();
      } else if (act === "copy") {
        doCopy();
      } else if (act === "dl") {
        doDownload();
      } else if (act === "forge") {
        doForge();
      }
    });

    const input = root.querySelector("[data-url]");
    input.addEventListener("dblclick", async () => {
      if (!input.value) return;
      try {
        await copyText(input.value);
        toast("已复制直链");
      } catch {
        input.select();
      }
    });

    return root;
  }

  function getVid() {
    // 1) 手动输入
    const manual = document.querySelector(`#${NS}-root [data-vid]`)?.value.trim();
    if (manual) return manual;
    // 2) URL /video/<id> 或 /download/<id>
    const m = location.pathname.match(/\/(?:video|download|embed)\/([^/?#]+)/i);
    if (m) return m[1];
    return null;
  }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.label) btn.dataset.label = btn.textContent;
      btn.disabled = true;
      btn.classList.add("busy");
      if (label) btn.textContent = label;
    } else {
      btn.disabled = false;
      btn.classList.remove("busy");
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }
  }

  function setStatus(msg, kind) {
    const el = document.querySelector(`#${NS}-root [data-status]`);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("ok", "err");
    if (kind) el.classList.add(kind);
  }

  function setMeta(v) {
    const el = document.querySelector(`#${NS}-root [data-meta]`);
    if (!el) return;
    el.innerHTML = [
      v.title ? `<span>标题 <b>${esc(v.title)}</b></span>` : "",
      v.videoType ? `<span>类型 <b>${esc(v.videoType)}</b></span>` : "",
      v.durationStr ? `<span>时长 <b>${esc(v.durationStr)}</b></span>` : "",
      v.size ? `<span>大小 <b>${esc(v.size)}</b></span>` : "",
      v.user ? `<span>作者 <b>${esc(v.user)}</b></span>` : "",
      v.downloadable ? `<span><b style="color:var(--xa-ok)">可下载</b></span>` : "",
    ].join("");
  }

  let lastData = null;

  async function doLoad({ play } = {}) {
    const root = document.getElementById(NS + "-root");
    const btn = root.querySelector('[data-act="load"]');
    setBusy(btn, true, "获取中…");
    try {
      const vid = getVid();
      if (!vid) throw new Error("未找到视频 ID（详情页 /video/<id>，或手动输入）");
      const line = root.querySelector("[data-line]")?.value || "default1";
      setStatus("请求 /sevenVideos/" + vid + " (line=" + line + ")…");
      const d = await api("/sevenVideos/" + vid, {
        userId: null,
        url_search: "?line=" + line,
        token: "ufd",
      });
      lastData = d;
      setMeta(d);
      const urls = d.m3u8s || [];
      if (!urls.length) throw new Error("响应无 m3u8s（可能该视频无播放源）");
      const url = urls[0];
      const input = root.querySelector("[data-url]");
      input.value = url;
      root.querySelector('[data-act="copy"]').disabled = false;
      root.querySelector('[data-act="dl"]').disabled = false;
      root.querySelector('[data-act="play"]').disabled = false;
      setStatus(
        `✅ ${d.videoType || "video"} · ${d.size || "?"} · 匿名直出完整 m3u8，付费校验纯前端已绕过。`,
        "ok"
      );
      toast("已获取直链");
      if (play) doPlay();
    } catch (e) {
      setStatus("失败: " + (e && e.message ? e.message : e), "err");
      toast(String((e && e.message) || e), "err");
    } finally {
      setBusy(btn, false);
    }
  }

  function doPlay() {
    const root = document.getElementById(NS + "-root");
    const url = root.querySelector("[data-url]")?.value;
    if (!url) {
      setStatus("还没有直链，先点「获取直链并播放」。", "err");
      return;
    }
    const video = root.querySelector("[data-video]");
    video.classList.add("show");
    playM3u8(video, url);
    setStatus("页内播放中（hls.js）· 不受站点 120 秒试看限制。", "ok");
  }

  async function doCopy() {
    const url = document.querySelector(`#${NS}-root [data-url]`)?.value;
    if (!url) return;
    try {
      await copyText(url);
      toast("已复制 m3u8 直链");
      setStatus("已复制直链（有签名时效，失效重取即可）。", "ok");
    } catch {
      document.querySelector(`#${NS}-root [data-url]`)?.select();
    }
  }

  async function doDownload() {
    const root = document.getElementById(NS + "-root");
    const url = root.querySelector("[data-url]")?.value;
    if (!url) {
      setStatus("没有直链", "err");
      return;
    }
    const btn = root.querySelector('[data-act="dl"]');
    setBusy(btn, true, "下载中…");
    try {
      const plRes = await fetch(url, {
        headers: { "User-Agent": navigator.userAgent, Referer: location.origin + "/" },
      });
      if (!plRes.ok) throw new Error("m3u8 HTTP " + plRes.status);
      const pl = await plRes.text();
      const segs = pl.split("\n").filter((l) => l && !l.startsWith("#"));
      if (!segs.length) throw new Error("m3u8 无分片");
      const base = url.slice(0, url.lastIndexOf("/") + 1);
      const name =
        (lastData && lastData.title
          ? String(lastData.title).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60)
          : getVid() || "video") + ".ts";
      const parts = [];
      for (let i = 0; i < segs.length; i++) {
        const segUrl = /^https?:\/\//i.test(segs[i]) ? segs[i] : base + segs[i];
        const r = await fetch(segUrl, {
          headers: { "User-Agent": navigator.userAgent, Referer: location.origin + "/" },
        });
        if (!r.ok) throw new Error("分片 " + i + " HTTP " + r.status);
        parts.push(await r.blob());
        setStatus(`拼接下载中… ${i + 1}/${segs.length}`, "ok");
      }
      const blob = new Blob(parts, { type: "video/mp2t" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      setStatus(`已生成 ${name}（${(blob.size / 1048576).toFixed(1)} MB）`, "ok");
      toast("下载已开始");
    } catch (e) {
      setStatus("下载失败: " + (e && e.message ? e.message : e), "err");
    } finally {
      setBusy(btn, false);
    }
  }

  function doForge() {
    const root = document.getElementById(NS + "-root");
    const vid = getVid() || "deadbeefdeadbeefdeadbeef";
    const user = {
      userId: vid,
      userEmail: "poc@" + location.hostname,
      activeUntil: Date.now() + 86400 * 365 * 100 * 1000, // ~100 年后
      token: "forged-token",
    };
    try {
      const enc = aesEncrypt(JSON.stringify(user), AES_KEY_LOCAL);
      localStorage.setItem(STORE_KEY, enc);
      setStatus(
        "✅ 已写入伪造会员态 " + STORE_KEY + "（activeUntil=100 年后）。刷新页面后站点视为有效会员，解锁 120 秒试看限制与会员 UI。",
        "ok"
      );
      toast("伪造会员态已写入，刷新页面生效");
    } catch (e) {
      setStatus("伪造失败: " + (e && e.message ? e.message : e), "err");
    }
  }

  function makeFloat() {
    let btn = document.getElementById(NS + "-float");
    if (btn) return btn;
    injectStyles();
    btn = document.createElement("button");
    btn.id = NS + "-float";
    btn.type = "button";
    btn.className = "xa-float";
    btn.textContent = "X*sian 免会员";
    btn.addEventListener("click", () => {
      const root = document.getElementById(NS + "-root");
      root.style.display = "";
      root.classList.remove("collapsed");
      root.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    document.body.appendChild(btn);
    return btn;
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    // 站点守卫：仅在已知同构域名运行；其他站点给个浮钮手动尝试
    if (!isKnownSite() && !/xasian/i.test(location.hostname)) return;

    // 等待 CryptoJS（@require）
    if (typeof CryptoJS === "undefined") {
      toast("CryptoJS 未加载，请检查 @require", "err");
      return;
    }

    const root = buildPanel();
    makeFloat();

    // 详情页自动获取
    if (/\/video\/[^/?#]+/i.test(location.pathname)) {
      setTimeout(() => doLoad({ play: false }), 800);
    } else {
      setStatus(
        "就绪。详情页 /video/<id> 自动取流；也可手动输入视频 ID 后点「获取直链并播放」。",
        "info"
      );
    }

    // SPA 路由变化时重置
    let lastPath = location.pathname + location.search;
    setInterval(() => {
      const now = location.pathname + location.search;
      if (now === lastPath) return;
      lastPath = now;
      const v = root.querySelector("[data-video]");
      if (v) { v.pause(); v.removeAttribute("src"); v.classList.remove("show"); }
      root.querySelector("[data-url]").value = "";
      root.querySelector("[data-meta]").innerHTML = "";
      lastData = null;
      if (/\/video\/[^/?#]+/i.test(location.pathname)) {
        setTimeout(() => doLoad({ play: false }), 500);
      }
    }, 800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* =====================================================================
 * 模块 5/5：爱*社区(bb*) - VIP/订阅/金币视频 免会员在线播放 + 下载 v1.0.0
 * ===================================================================== */
(function () {
  "use strict";

  /* 站点守卫：仅 bbav110.com / avjb.com 及其子域 */
  if (!/(^|\.)(bbav110\.com|avjb\.com)$/i.test(location.hostname)) return;

  /* 仅视频详情页 /video/{id}/ 或 /videos/{id}/ */
  const vidMatch = location.pathname.match(/\/video[s]?\/(\d+)\//);
  if (!vidMatch) return;

  const NS = "bbav-x5";
  const VIDEO_ID = parseInt(vidMatch[1], 10);
  const GROUP = String(Math.floor(VIDEO_ID / 1000) * 1000); // CDN 分组不补零（80000 而非 080000）
  const HOSTS = [
    "https://list.avstatic.com",
    "https://bot.imgclh.com",
    "https://newz.jb-aiwei.cc",
  ];
  const PREF = "nsfw_bbav_";
  const DL_CONC = 8;
  const MAX_SEG = 40000;

  const $ = (sel, root) => (root || document).querySelector(sel);

  function prefGet(k, d) {
    try {
      const v = GM_getValue(PREF + k, d);
      return v === undefined ? d : v;
    } catch { return d; }
  }
  function prefSet(k, v) {
    try { GM_setValue(PREF + k, v); } catch (_) {}
  }

  function toast(msg, kind, ms) {
    let host = document.getElementById("nsfw-dp-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "nsfw-dp-toast-host";
      document.documentElement.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = "nsfw-dp-toast " + (kind || "ok");
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 280); }, ms || 2400);
  }

  function gmGet(url, { binary } = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 40000,
        responseType: binary ? "arraybuffer" : "text",
        onload: (res) => {
          if (res.status < 200 || res.status >= 400) return reject(new Error("HTTP " + res.status));
          resolve(res);
        },
        onerror: () => reject(new Error("网络错误")),
        ontimeout: () => reject(new Error("请求超时")),
      });
    });
  }

  function segUrl(n) {
    return `${HOSTS[0]}/videos/${GROUP}/${VIDEO_ID}/${String(n).padStart(4, "0")}.jpg`;
  }

  async function segExists(n) {
    try { return (await gmGet(segUrl(n))).status === 200; } catch { return false; }
  }

  async function probeCount() {
    if (!(await segExists(0))) return null;
    let lo = 0, hi = MAX_SEG;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (await segExists(mid)) lo = mid; else hi = mid;
    }
    return lo + 1;
  }

  /* 从第一个分片解析视频 PES 的 PTS，得到分片秒数（PES 头不一定在 TS 包起点，全量扫描 00 00 01 e0） */
  async function probeSegDur() {
    try {
      const res = await gmGet(segUrl(0), { binary: true });
      const u8 = new Uint8Array(res.response);
      let first = null, last = null;
      for (let p = 0; p + 14 <= u8.length; p++) {
        if (u8[p] !== 0 || u8[p + 1] !== 0 || u8[p + 2] !== 1 || u8[p + 3] !== 0xe0) continue; // 视频 PES 起始码
        if (!(u8[p + 7] & 0x80)) continue; // 有 PTS
        const mk = u8[p + 9];
        if ((mk & 0xe0) !== 0x20) continue; // PTS 标记 0x21(PTS) / 0x31(PTS+DTS)
        const pts = ((mk & 0x0e) << 29) | ((u8[p + 10] & 0xfe) << 22) |
                    ((u8[p + 11] & 0xfe) << 14) | ((u8[p + 12] & 0xfe) << 7) | (u8[p + 13] >> 1);
        if (first === null) first = pts;
        last = pts;
      }
      if (first !== null && last !== null && last > first) {
        const d = (last - first) / 90000;
        if (d > 0.2 && d < 10) return d;
      }
      return 2;
    } catch { return 2; }
  }

  function buildM3u8(count, segDur) {
    const lines = ["#EXTM3U", "#EXT-X-VERSION:3",
      `#EXT-X-TARGETDURATION:${Math.max(1, Math.ceil(segDur))}`,
      "#EXT-X-MEDIA-SEQUENCE:0", "#EXT-X-PLAYLIST-TYPE:VOD"];
    for (let i = 0; i < count; i++) {
      lines.push(`#EXTINF:${segDur.toFixed(3)},`, segUrl(i));
    }
    lines.push("#EXT-X-ENDLIST");
    return lines.join("\n") + "\n";
  }

  /* ---------------- UI ---------------- */

  GM_addStyle(`
#${NS}-root{position:fixed;right:16px;bottom:16px;z-index:2147483645;width:264px;
 background:linear-gradient(165deg,#241a2e,#141018);border:1px solid #ff3b6f66;border-radius:14px;
 padding:12px 14px;color:#eee;font:13px/1.5 system-ui,sans-serif;
 box-shadow:0 12px 34px rgba(0,0,0,.6)}
#${NS}-root h3{margin:0 0 6px;font-size:14px;color:#ffd76a;display:flex;justify-content:space-between;align-items:center}
#${NS}-root h3 button{background:none;border:0;color:#888;cursor:pointer;font-size:13px}
#${NS}-root .bb-tip{color:#a99;font-size:11px;margin-bottom:8px;word-break:break-all}
#${NS}-root .bb-btn{display:block;width:100%;margin:5px 0;padding:8px 10px;border:0;border-radius:8px;cursor:pointer;
 font-size:13px;font-weight:650;background:#2c2438;color:#eee;text-align:center}
#${NS}-root .bb-btn:hover{background:#3a3050}
#${NS}-root .bb-btn.primary{background:linear-gradient(90deg,#ff3b6f,#c91c4f);color:#fff}
#${NS}-root .bb-btn:disabled{opacity:.5;cursor:not-allowed}
#${NS}-root .bb-bar{height:6px;background:#221c2c;border-radius:3px;margin-top:8px;overflow:hidden}
#${NS}-root .bb-bar>div{height:100%;width:0;background:linear-gradient(90deg,#ffd76a,#ff3b6f);transition:width .2s}
#${NS}-root .bb-log{color:#8f8;font-size:11px;margin-top:6px;word-break:break-all;max-height:64px;overflow:auto}
#${NS}-player{position:fixed;inset:0;z-index:2147483646;background:#000;display:none;align-items:center;justify-content:center}
#${NS}-player.show{display:flex}
#${NS}-player video{max-width:98vw;max-height:98vh;background:#000}
#${NS}-player .bb-close{position:absolute;top:12px;right:16px;z-index:2;background:#ea1853;border:0;color:#fff;
 font-size:15px;padding:8px 16px;border-radius:8px;cursor:pointer}
`);

  function ensurePanel() {
    let root = document.getElementById(`${NS}-root`);
    if (root) return root;
    root = document.createElement("div");
    root.id = `${NS}-root`;
    root.innerHTML = `
<h3>🔓 爱*社区 免会员<button type="button" data-act="hide">✕</button></h3>
<div class="bb-tip" data-tip>视频ID ${VIDEO_ID} · 检测中...</div>
<button type="button" class="bb-btn primary" data-act="play">▶ 在线播放（免会员）</button>
<button type="button" class="bb-btn" data-act="trial" style="display:none">▶ 播放试看（仅 30 秒）</button>
<button type="button" class="bb-btn" data-act="m3u8">⬇ 下载 m3u8 列表</button>
<button type="button" class="bb-btn" data-act="dl">⬇ 下载完整视频 .ts</button>
<div class="bb-bar"><div data-bar></div></div>
<div class="bb-log" data-log>初始化…</div>`;
    document.body.appendChild(root);
    root.querySelector('[data-act="hide"]').onclick = () => { root.style.display = "none"; };
    return root;
  }

  function ensurePlayer() {
    let wrap = document.getElementById(`${NS}-player`);
    if (wrap) return wrap;
    wrap = document.createElement("div");
    wrap.id = `${NS}-player`;
    wrap.innerHTML = `<button type="button" class="bb-close">✕ 关闭</button>
      <video controls autoplay playsinline></video>`;
    wrap.querySelector(".bb-close").onclick = () => wrap.classList.remove("show");
    document.body.appendChild(wrap);
    return wrap;
  }

  /* ---------------- 动作 ---------------- */

  function setLog(msg, kind) {
    const el = $(`[data-log]`, document.getElementById(`${NS}-root`));
    if (!el) return;
    el.textContent = msg;
    if (kind) el.style.color = kind === "err" ? "#f88" : "#8f8";
  }
  function setBar(pct) {
    const el = $(`[data-bar]`, document.getElementById(`${NS}-root`));
    if (el) el.style.width = Math.min(100, pct) + "%";
  }
  function setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = busy;
  }

  let STATE = null; // { count, segDur, m3u8, totalSec }

  /* 从页面提取旧式播放器（Playerjs）内联的试看源 file 参数 */
  function findTrialUrl() {
    try {
      const m = document.documentElement.innerHTML.match(
        /file\s*:\s*"([^"]+video_limt\.mp4)"/);
      return m ? m[1] : null;
    } catch { return null; }
  }

  async function ensureState() {
    if (STATE) return STATE;
    setLog("探测分片…");
    const count = await probeCount();
    if (!count) {
      const trial = findTrialUrl();
      const trialBtn = $(`[data-act="trial"]`, document.getElementById(`${NS}-root`));
      if (trial) {
        if (trialBtn) {
          trialBtn.style.display = "";
          trialBtn.dataset.url = trial;
        }
        setLog("该视频无完整分片（2024-09 前旧视频未分片化）· 站点仅提供试看源", "err");
      } else {
        setLog("该视频无可用视频源（站点自身播放器亦为空）", "err");
      }
      return null;
    }
    const segDur = await probeSegDur();
    const m3u8 = buildM3u8(count, segDur);
    const totalSec = Math.round(count * segDur);
    STATE = { count, segDur, m3u8, totalSec };
    const tip = $(`[data-tip]`, document.getElementById(`${NS}-root`));
    if (tip) tip.textContent = `视频ID ${VIDEO_ID} · ${count} 片 ≈ ${Math.floor(totalSec / 60)}m${totalSec % 60}s · ${segDur.toFixed(1)}s/片`;
    setLog(`就绪：${count} 片 ≈ ${Math.floor(totalSec / 60)}m${totalSec % 60}s`);
    return STATE;
  }

  function doPlayTrial() {
    const btn = $(`[data-act="trial"]`, document.getElementById(`${NS}-root`));
    if (!btn || !btn.dataset.url) return;
    const wrap = ensurePlayer();
    const video = wrap.querySelector("video");
    if (video._hls) { try { video._hls.destroy(); } catch (_) {} }
    video.src = btn.dataset.url;
    video.load();
    wrap.classList.add("show");
    const p = video.play(); if (p && p.catch) p.catch(() => {});
    setLog("试看源播放中（该视频完整版未公开）");
  }

  async function doPlay() {
    const btn = $(`[data-act="play"]`, document.getElementById(`${NS}-root`));
    setBusy(btn, true);
    try {
      const st = await ensureState();
      if (!st) return;
      setLog("加载播放器…");
      if (typeof window.Hls === "undefined") {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js";
          s.onload = res; s.onerror = () => rej(new Error("hls.js 加载失败"));
          document.head.appendChild(s);
        });
      }
      const wrap = ensurePlayer();
      const video = wrap.querySelector("video");
      const blobUrl = URL.createObjectURL(new Blob([st.m3u8], { type: "application/vnd.apple.mpegurl" }));
      if (window.Hls && Hls.isSupported()) {
        if (video._hls) video._hls.destroy();
        const hls = new Hls({ maxBufferLength: 30 });
        video._hls = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
        hls.on(Hls.Events.ERROR, (e, d) => {
          if (d.fatal) setLog("播放错误: " + d.type + " / " + d.details, "err");
        });
        hls.loadSource(blobUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = blobUrl;
      } else {
        throw new Error("浏览器不支持 HLS");
      }
      wrap.classList.add("show");
      setLog(`播放中：${st.count} 片 · 直连 CDN（免会员）`);
    } catch (e) {
      setLog("播放失败: " + (e && e.message ? e.message : e), "err");
      toast(String(e.message || e), "err");
    } finally {
      setBusy(btn, false);
    }
  }

  function doDlM3u8() {
    if (!STATE) {
      ensureState().then(() => doDlM3u8());
      return;
    }
    const blob = new Blob([STATE.m3u8], { type: "application/vnd.apple.mpegurl" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bbav_${VIDEO_ID}.m3u8`;
    a.click();
    setLog("m3u8 已下载（可用 VLC / ffmpeg 播放或下载）");
    toast("m3u8 已下载");
  }

  async function doDlAll() {
    const btn = $(`[data-act="dl"]`, document.getElementById(`${NS}-root`));
    setBusy(btn, true);
    try {
      const st = await ensureState();
      if (!st) return;
      setLog(`下载中 0% …`);
      const parts = new Array(st.count);
      let done = 0;
      const worker = async (i) => {
        try {
          const res = await gmGet(segUrl(i), { binary: true });
          parts[i] = res.response;
        } catch { parts[i] = null; }
        done++;
        setBar((done / st.count) * 100);
        if (done % 40 === 0 || done === st.count) setLog(`下载中 ${((done / st.count) * 100).toFixed(0)}% (${done}/${st.count})`);
      };
      for (let i = 0; i < st.count; i += DL_CONC) {
        await Promise.all(Array.from({ length: Math.min(DL_CONC, st.count - i) }, (_, k) => worker(i + k)));
      }
      const ok = parts.filter(Boolean).length;
      if (!ok) throw new Error("分片全部下载失败");
      const blob = new Blob(parts.filter(Boolean), { type: "video/mp2t" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `bbav_${VIDEO_ID}_full.ts`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      setLog(`完成：${ok}/${st.count} 片 → bbav_${VIDEO_ID}_full.ts (${(blob.size / 1048576).toFixed(1)} MB)`);
      toast("完整视频已开始下载");
    } catch (e) {
      setLog("下载失败: " + (e && e.message ? e.message : e), "err");
      toast(String(e.message || e), "err");
    } finally {
      setBusy(btn, false);
    }
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    const root = ensurePanel();
    root.querySelector('[data-act="play"]').onclick = doPlay;
    root.querySelector('[data-act="trial"]').onclick = doPlayTrial;
    root.querySelector('[data-act="m3u8"]').onclick = doDlM3u8;
    root.querySelector('[data-act="dl"]').onclick = doDlAll;
    // 页面自带播放器时（免费视频），面板浮在右下角不干扰
    ensureState().catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
